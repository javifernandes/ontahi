import assert from 'node:assert/strict';

import { entity, field, query } from '@ontahi/core/data-graph';
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
