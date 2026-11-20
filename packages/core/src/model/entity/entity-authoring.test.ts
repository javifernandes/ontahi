import { describe, expect, it } from 'vitest';

import {
  addEntityLocators,
  addEntityRelation,
  bindReferenceFieldSources,
  createEntityDefinitionState,
  setEntityDisplayMetadata,
  setEntityFreshnessMetadata,
  setEntityIdentity,
} from './entity-authoring.js';
import { field } from './field-authoring.js';

describe('Entity authoring state', () => {
  it('derives conventional identity and reference Relations without compatibility dependencies', () => {
    const target = createEntityDefinitionState('Target', { id: field.id() });
    const source = createEntityDefinitionState('Source', {
      id: field.id(),
      target: field.ref(target as never),
    });

    expect(source.identityLocatorName).toBe('refById');
    expect(source.relations.target).toMatchObject({
      relationKind: 'belongsTo',
      sourceField: 'target',
      target,
    });
    bindReferenceFieldSources(source.fields, source as never);
    expect(source.fields.target).toMatchObject({ source, fieldName: 'target' });
  });

  it('owns fluent Entity metadata, locator, identity, and Relation mutations', () => {
    const target = createEntityDefinitionState('Target', { id: field.id() });
    const source = createEntityDefinitionState('Source', { id: field.id(), slug: field.slug() });

    setEntityDisplayMetadata(source, { primary: 'slug' });
    setEntityFreshnessMetadata(source, { updatedAt: 'slug' });
    addEntityLocators(source, { refBySlug: 'slug' });
    setEntityIdentity(source, 'refBySlug');
    addEntityRelation(source, 'targets', 'hasMany', target as never, { ordered: true });

    expect(source).toMatchObject({
      displayMetadata: { primary: 'slug' },
      freshnessMetadata: { updatedAt: 'slug' },
      identityLocatorName: 'refBySlug',
      relations: { targets: { relationKind: 'hasMany', ordered: true } },
    });
  });
});
