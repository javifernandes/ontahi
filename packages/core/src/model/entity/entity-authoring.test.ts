import { describe, expect, it } from 'vitest';

import { bindReferenceFieldSources, createEntityDefinitionState } from './entity-authoring.js';
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
});
