import assert from 'node:assert/strict';

import { entity, field, query, Selection, withContextualSelections } from '@ontahi/core/data-graph';
import { createMysqlDataGraphStorage } from '@ontahi/mysql';
import { Effect } from 'effect';

// Real-driver behavior is covered by the MySQL integration suite. This smoke proves the packed
// package binds Core Entities and executes its read interpreter from a clean consumer.
const Item = entity('PackedMysqlItem', { id: field.id(), title: field.string() });
const storage = createMysqlDataGraphStorage({
  pool: {
    execute: async () => [[{ id: 'packed', title: 'Packed MySQL' }], []],
    getConnection: async () => {
      throw new Error('The read smoke must not acquire a transaction.');
    },
  },
});
storage.bindEntities([Item]);
const rows = await Effect.runPromise(storage.createRuntime().run(query(Item), undefined));
assert.deepEqual(rows, [{ id: 'packed', title: 'Packed MySQL' }]);

const Child = entity('PackedMysqlChild', { id: field.id(), parentId: field.string() });
const Parent = withContextualSelections(
  Item.hasMany('children', Child, { via: 'parentId' }),
  ({ self }) => ({ childrenSelection: self.children }),
);
const statements = [];
const contextualStorage = createMysqlDataGraphStorage({
  pool: {
    execute: async (text, values) => {
      statements.push({ text, values });
      return [[{ id: 'child', parentId: 'packed' }], []];
    },
    getConnection: async () => {
      throw new Error('Contextual reads must not prefetch membership.');
    },
  },
});
contextualStorage.bindEntities([Parent, Child]);
assert.deepEqual(contextualStorage.graphReadCapabilities, { relationSelections: true });
const selected = Selection.where(Parent, p => p.id.eq('packed')).childrenSelection;
assert.deepEqual(
  await Effect.runPromise(contextualStorage.createRuntime().run(selected.toQuery(), undefined)),
  [{ id: 'child', parentId: 'packed' }],
);
assert.equal(statements.length, 1);
assert.match(statements[0].text, /EXISTS/);
assert.deepEqual(statements[0].values, ['packed']);
