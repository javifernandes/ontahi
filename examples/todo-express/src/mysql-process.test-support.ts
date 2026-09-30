import assert from 'node:assert/strict';

import {
  mutateEntity,
  query,
  relationship,
  relationshipSet,
  toGraphCommandRequest,
  type EntityMutationCommand,
  type EntityMutationDelta,
} from '@ontahi/core/data-graph';
import {
  getOntahiSemanticEntities,
  type GraphCommandableOntahiApplication,
} from '@ontahi/core/runtime/server';
import { Effect } from 'effect';

import { createTodoExpressApp } from './application.js';
import { TodoApplication, TodoItem, TodoList, Tag } from './graph.js';
import { defaultStorage } from './storage.js';
import { todoGraphCommandPolicies } from './todo-command-policies.js';

// Each invocation is a new host process. The parent test supplies an isolated MySQL database.
const server = createTodoExpressApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
try {
  if (defaultStorage.kind !== 'mysql') throw new Error('Expected MySQL storage.');
  const runtime = defaultStorage.createRuntime();
  const dispatch = (
    TodoApplication as unknown as GraphCommandableOntahiApplication
  ).createGraphCommandDispatcher(todoGraphCommandPolicies);
  const executeMutation = async (command: EntityMutationCommand): Promise<EntityMutationDelta> => {
    const result = await dispatch(toGraphCommandRequest(command), {
      authority: { principal: { subject: 'mysql-process-test', kind: 'system' } },
    });
    assert.equal(result.kind, 'graph-command-result');
    return result.value as EntityMutationDelta;
  };
  if (process.argv[2] === 'write') {
    const createdList = await executeMutation({
      kind: 'entity-mutation-command',
      action: 'create',
      entityName: 'TodoList',
      values: { name: 'Persistent list', color: 'blue' },
    });
    const listId = String(createdList.created[0]!.ref!.locator.id);
    const itemIds: string[] = [];
    for (const title of ['Persistent one', 'Persistent two']) {
      const createdItem = await executeMutation({
        kind: 'entity-mutation-command',
        action: 'create',
        entityName: 'TodoItem',
        values: {
          list: TodoList.refById(listId),
          title,
          completed: false,
        },
      });
      itemIds.push(String(createdItem.created[0]!.ref!.locator.id));
    }
    await executeMutation(
      mutateEntity(Tag).create({ id: 'persist-tag', name: 'Persistent tag', color: 'red' }),
    );
    await Effect.runPromise(
      runtime.runManyToManyRelationshipCommand(
        relationshipSet(TodoItem, 'tags', TodoItem.refById(itemIds[0]!)).add(
          Tag.refById('persist-tag'),
        ),
      ),
    );
    await Effect.runPromise(
      runtime.runOrderedRelationshipCommand(
        relationship(TodoList, 'items', TodoList.refById(listId)).move(
          TodoItem.refById(itemIds[1]!),
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
  assert.equal(lists.length, 1);
  const [persistedList] = lists;
  assert.equal(persistedList!.name, 'Persistent list');
  assert.equal(persistedList!.color, 'blue');
  const persistedItems = persistedList!.items;
  assert(Array.isArray(persistedItems));
  assert.deepEqual(
    persistedItems.map(item => {
      const { id, list, ...values } = item as Record<string, unknown>;
      assert.match(String(id), /^[0-9a-f-]{36}$/);
      assert.deepEqual(list, TodoList.refById(String(persistedList!.id)));
      return values;
    }),
    [
      { title: 'Persistent two', completed: false, tags: [] },
      {
        title: 'Persistent one',
        completed: false,
        tags: [{ id: 'persist-tag', name: 'Persistent tag', color: 'red' }],
      },
    ],
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
}
// Ending the host also closes the host-owned pool. The next process must recover state from MySQL.
process.exit(0);
