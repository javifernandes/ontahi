import assert from 'node:assert/strict';

import { mutateEntity, query, relationship, relationshipSet } from '@ontahi/core/data-graph';
import { getOntahiSemanticEntities } from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

import { createTodoExpressApp } from './application.js';
import { TodoItem, TodoList, Tag } from './graph.js';
import { defaultStorage } from './storage.js';

// Each invocation is a new host process. The parent test supplies an isolated MySQL database.
const server = createTodoExpressApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
try {
  if (defaultStorage.kind !== 'mysql') throw new Error('Expected MySQL storage.');
  const runtime = defaultStorage.createRuntime();
  if (process.argv[2] === 'write') {
    await Effect.runPromise(
      runtime.runEntityMutationCommand({
        kind: 'entity-mutation-command',
        action: 'create',
        entityName: 'TodoList',
        values: { id: 'persist-list', name: 'Persistent list', color: 'blue' },
      }),
    );
    for (const id of ['persist-one', 'persist-two'])
      await Effect.runPromise(
        runtime.runEntityMutationCommand({
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'TodoItem',
          values: {
            id,
            list: TodoList.refById('persist-list'),
            title: id,
            completed: false,
          },
        }),
      );
    await Effect.runPromise(
      runtime.runEntityMutationCommand(
        mutateEntity(Tag).create({ id: 'persist-tag', name: 'Persistent tag', color: 'red' }),
      ),
    );
    await Effect.runPromise(
      runtime.runManyToManyRelationshipCommand(
        relationshipSet(TodoItem, 'tags', TodoItem.refById('persist-one')).add(
          Tag.refById('persist-tag'),
        ),
      ),
    );
    await Effect.runPromise(
      runtime.runOrderedRelationshipCommand(
        relationship(TodoList, 'items', TodoList.refById('persist-list')).move(
          TodoItem.refById('persist-two'),
          { at: 'start' },
        ),
      ),
    );
  }
  const lists = await Effect.runPromise(
    runtime.run(
      query(getOntahiSemanticEntities(TodoList)[0]!).include(list => ({
        items: list.items.include(item => ({ tags: item.tags })),
      })),
      undefined,
    ),
  );
  assert.deepEqual(lists, [
    {
      id: 'persist-list',
      name: 'Persistent list',
      color: 'blue',
      items: ['persist-two', 'persist-one'].map(id => ({
        id,
        title: id,
        completed: false,
        list: { kind: 'entity-ref', entityName: 'TodoList', locator: { id: 'persist-list' } },
        tags:
          id === 'persist-one' ? [{ id: 'persist-tag', name: 'Persistent tag', color: 'red' }] : [],
      })),
    },
  ]);
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
}
// Ending the host also closes the host-owned pool. The next process must recover state from MySQL.
process.exit(0);
