import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  field,
  reflectEntityMutationAffordances,
  safeParseUnknownGraphSchema,
  toEntityMutationAffordanceDescriptor,
  toGraphSchemaDescriptor,
  type EntityMutationCommandPolicy,
} from '../../../../data-graph/index.js';
import { entity } from '../../entity.js';

import { createModelEntityMutationExposure } from './entity-mutation.js';

const Document = entity({
  name: 'Document',
  fields: {
    id: field.id(),
    title: field.nonEmptyString({ trim: true }),
    published: field.default(field.boolean(), false),
  },
});

const policy = {
  entity: Document,
  scope: 'all',
  actions: {
    create: { fields: ['id', 'title', 'published'], result: ['id', 'title', 'published'] },
    update: {
      fields: ['title', 'published'],
      if: ['title', 'published'],
      result: ['id', 'title', 'published'],
    },
    delete: { if: ['title'], result: ['id', 'title'] },
  },
} as const satisfies EntityMutationCommandPolicy<typeof Document>;

describe('Model Entity mutation exposure', () => {
  it('reflects a strict canonical command schema from the Entity and policy', () => {
    const exposure = createModelEntityMutationExposure(policy, {
      action: 'create',
      values: ['id', 'title', 'published'],
      valueLiterals: { published: false },
      description: 'Create a document.',
    });

    expect(
      safeParseUnknownGraphSchema(exposure.request, {
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'Document',
          values: { id: 'doc-1', title: '  Draft  ' },
        },
      }),
    ).toEqual({
      success: true,
      data: {
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'Document',
          values: { id: 'doc-1', title: 'Draft', published: false },
        },
      },
    });
  });

  it('projects reference targets, conditions, and exact literal values', () => {
    const exposure = createModelEntityMutationExposure(policy, {
      action: 'update',
      values: ['published'],
      valueLiterals: { published: true },
      condition: ['published'],
      conditionLiterals: { published: false },
      description: 'Publish a document.',
    });
    const request = {
      version: 2,
      kind: 'graph-command',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Document',
        target: createEntityRef(Document, { id: 'doc-1' }),
        values: { published: true },
        if: { published: false },
      },
    };

    expect(safeParseUnknownGraphSchema(exposure.request, request).success).toBe(true);
    expect(
      safeParseUnknownGraphSchema(exposure.request, {
        ...request,
        command: { ...request.command, values: { published: false } },
      }).success,
    ).toBe(false);

    const variable = createModelEntityMutationExposure(policy, {
      action: 'update',
      values: ['published'],
      description: 'Change publication.',
    });
    expect(
      safeParseUnknownGraphSchema(variable.request, {
        version: 1,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Document',
          target: createEntityRef(Document, { id: 'doc-1' }),
          values: {},
        },
      }).success,
    ).toBe(false);
  });

  it('fails fast when an exposure exceeds its execution policy', () => {
    expect(() =>
      createModelEntityMutationExposure(policy, {
        action: 'delete',
        condition: ['published'],
        description: 'Delete a published document.',
      }),
    ).toThrow('condition field published outside its command policy');
  });

  it('projects the same reflected Field semantics used by Runtime Protocol discovery', () => {
    const affordance = toEntityMutationAffordanceDescriptor(
      reflectEntityMutationAffordances(policy).find(candidate => candidate.action === 'create')!,
    );
    const exposure = createModelEntityMutationExposure(policy, {
      action: 'create',
      values: ['id', 'title', 'published'],
      description: 'Create a document.',
    });
    const request = toGraphSchemaDescriptor(exposure.request);
    if (request.kind !== 'object') throw new Error('Expected a request object.');
    const command = request.fields.command;
    if (command?.kind !== 'object') throw new Error('Expected a command object.');

    expect(command.fields.values).toEqual(affordance.values);
    expect(command.fields.values).toMatchObject({
      fields: {
        title: { field: { source: 'caller-required' } },
        published: { field: { source: 'defaulted' } },
      },
    });
  });
});
