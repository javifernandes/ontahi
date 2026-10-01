import { describe, expect, it } from 'vitest';

import {
  entity,
  field,
  isEntityMutationAffordanceDescriptor,
  reflectEntityMutationAffordances,
  toEntityMutationAffordanceDescriptor,
  type EntityMutationCommandPolicy,
} from './index.js';

describe('Entity mutation affordance reflection', () => {
  it('combines Entity Field semantics with the exact policy allowlists', () => {
    const Folder = entity('AffordanceFolder', { id: field.id() });
    const Document = entity('AffordanceDocument', {
      id: field.generated(field.id(), 'uuid'),
      title: field.string(),
      subtitle: field.optional(field.string()),
      published: field.default(field.boolean(), false),
      archivedAt: field.nullable(field.string()),
      folder: field.existingRef(Folder),
      searchLabel: field.derived(field.string(), () => ''),
      secret: field.string(),
    });
    const policy = {
      entity: Document,
      scope: 'all',
      actions: {
        create: {
          fields: ['title', 'subtitle', 'published', 'archivedAt', 'folder'],
          result: ['id', 'title'],
        },
        update: {
          fields: ['title', 'archivedAt'],
          if: ['published'],
          result: ['id', 'title'],
          selection: { fields: { title: ['eq', 'in'], archivedAt: ['isNull'] } },
        },
        delete: { if: ['published'], result: ['id'] },
      },
    } as const satisfies EntityMutationCommandPolicy<typeof Document>;

    const descriptors = reflectEntityMutationAffordances(policy).map(
      toEntityMutationAffordanceDescriptor,
    );

    expect(descriptors).toHaveLength(3);
    expect(descriptors.every(isEntityMutationAffordanceDescriptor)).toBe(true);
    expect(descriptors[0]).toMatchObject({
      entityName: 'AffordanceDocument',
      action: 'create',
      values: {
        unknownKeys: 'strict',
        fields: {
          title: { field: { source: 'caller-required', nullable: false } },
          subtitle: { kind: 'optional', field: { source: 'caller-optional', nullable: false } },
          published: { kind: 'default', field: { source: 'defaulted', nullable: false } },
          archivedAt: { kind: 'nullable', field: { source: 'caller-required', nullable: true } },
          folder: {
            kind: 'entity-ref',
            entityName: 'AffordanceFolder',
            mutationRequirement: 'existing',
          },
        },
      },
    });
    expect(Object.keys(descriptors[0]!.values!.fields)).not.toEqual(
      expect.arrayContaining(['id', 'searchLabel', 'secret']),
    );
    expect(descriptors[1]).toMatchObject({
      action: 'update',
      target: {
        exact: {
          reference: { kind: 'entity-ref', entityName: 'AffordanceDocument' },
          locator: { fields: { id: { field: { source: 'generated' } } } },
        },
        selection: {
          fields: {
            title: { operators: ['eq', 'in'] },
            archivedAt: { operators: ['isNull'] },
          },
        },
      },
      values: { fields: { title: {}, archivedAt: {} } },
      condition: { fields: { published: { field: { source: 'defaulted' } } } },
    });
    expect(descriptors[2]).toMatchObject({
      action: 'delete',
      target: { exact: { locator: { fields: { id: {} } } } },
      condition: { fields: { published: {} } },
    });
  });

  it('rejects malformed portable descriptors defensively', () => {
    expect(
      isEntityMutationAffordanceDescriptor({
        kind: 'entity-mutation-affordance',
        entityName: 'Document',
        action: 'create',
        values: { kind: 'object', unknownKeys: 'strict', fields: { title: { kind: 'sql' } } },
      }),
    ).toBe(false);
    expect(
      isEntityMutationAffordanceDescriptor({
        kind: 'entity-mutation-affordance',
        entityName: 'Document',
        action: 'create',
        values: {
          kind: 'object',
          unknownKeys: 'strict',
          fields: {
            id: {
              kind: 'scalar',
              type: 'id',
              generatedBy: 'uuid',
              field: { source: 'generated', nullable: false },
            },
          },
        },
      }),
    ).toBe(false);
  });
});
