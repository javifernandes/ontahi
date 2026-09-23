import { expect, it } from 'vitest';

import {
  createEntityRef,
  field,
  graphSchema,
  Selection,
  toGraphJsonSchema,
} from '../../data-graph/index.js';

import { entity } from './entity.js';
import { createModelContextSchema } from './model-context-schema.js';

it('grounds nested canonical references and selections in disclosed values', () => {
  const Document = entity({ name: 'Document', fields: { id: field.id() } });
  const ref = createEntityRef(Document, { id: 'visible' });
  const selection = Selection.references(Document, [ref]).toJSON();
  const project = createModelContextSchema({ documents: [{ ref, selection }, { ref }] });
  expect(project(toGraphJsonSchema(graphSchema.ref(Document)))).toEqual({ enum: [ref] });
  expect(
    project({
      type: 'object',
      properties: { input: toGraphJsonSchema(graphSchema.ref(Document)) },
    }),
  ).toEqual({ type: 'object', properties: { input: { enum: [ref] } } });
  expect(
    project({
      type: 'object',
      'x-ontahi-selection': { entityName: 'Document', cardinality: 'many' },
    }),
  ).toEqual({ enum: [selection] });
});

it('preserves schemas without disclosed candidates and leaves source schemas unchanged', () => {
  const schema = { type: 'string', minLength: 1 };
  expect(createModelContextSchema({})(schema)).toEqual(schema);
  expect(schema).toEqual({ type: 'string', minLength: 1 });
});
