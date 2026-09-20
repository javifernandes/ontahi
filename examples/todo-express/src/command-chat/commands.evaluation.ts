// Run explicitly in a disposable process; never against a persistent Todo store.
import assert from 'node:assert/strict';

import { TodoApplication, todoModelRuntime } from '../graph.js';
import { TodoItem, TodoList } from '../todo.js';

if (TodoApplication.storage.kind !== 'in-memory' || process.env.TODO_AUTH_MODE !== 'disabled') {
  throw new Error('Evaluation requires TODO_STORAGE=in-memory and TODO_AUTH_MODE=disabled.');
}
if (!process.env.TODO_LLM_MODEL)
  throw new Error('Set TODO_LLM_MODEL to an installed Ollama model.');

const submit = async ({
  text,
  list,
}: {
  text: string;
  list: ReturnType<typeof TodoList.refById> | null;
}) =>
  todoModelRuntime!.submit(
    { text, ...(list ? { context: { focus: list } } : {}) },
    new AbortController().signal,
  );
const dataset = TodoApplication.storage.dataset;
dataset.TodoList = [{ id: 'evaluation-list', name: 'Shopping', color: '#f5ddd5' }];
dataset.TodoItem = [
  { id: 'evaluation-tea', list: 'evaluation-list', title: 'buy bread', completed: false },
];
const list = TodoList.refById('evaluation-list');
for (const text of ['add item buy hamburgers', 'complete buy bread']) {
  const start = Date.now();
  const result = await submit({ text, list });
  console.info(
    JSON.stringify({
      model: process.env.TODO_LLM_MODEL,
      text,
      elapsedMs: Date.now() - start,
      result,
    }),
  );
  assert.equal(result.status, 'executed');
}
assert.equal(dataset.TodoItem.length, 2);
assert.equal(dataset.TodoItem[0]!.completed, true);
assert.match(String(dataset.TodoItem[1]!.title), /hamburgers/i);

await TodoItem.createItem({ id: 'duplicate-1', list, title: 'buy milk' });
await TodoItem.createItem({ id: 'duplicate-2', list, title: 'buy milk' });
for (const text of ['complete buy milk', 'complete buy coffee']) {
  const start = Date.now();
  const result = await submit({ text, list });
  console.info(
    JSON.stringify({
      model: process.env.TODO_LLM_MODEL,
      text,
      elapsedMs: Date.now() - start,
      result,
    }),
  );
  assert.equal(result.status, 'unresolved');
}
assert.equal(dataset.TodoItem.filter(item => item.completed).length, 1);
console.info(
  'Real-model evaluation passed: create, complete, ambiguous, missing. No persistent data changed.',
);

for (const selected of [null, list]) {
  const before: number = dataset.TodoItem.length;
  const result = await submit({
    text: 'create list Holidays',
    list: selected,
  });
  console.info(
    JSON.stringify({ model: process.env.TODO_LLM_MODEL, selected: Boolean(selected), result }),
  );
  assert.equal(result.status, 'executed');
  assert.equal(dataset.TodoItem.length, before);
}
assert.equal(dataset.TodoList.filter(item => item.name === 'Holidays').length, 2);
console.info('List creation passed with and without a current list.');

await TodoList.createList({ id: 'delete-me', name: 'Groceries', color: '#fff' });
await TodoItem.createItem({
  id: 'delete-child',
  list: TodoList.refById('delete-me'),
  title: 'buy apples',
});
const deletion = await submit({ text: 'delete list Groceries', list });
console.info(JSON.stringify({ text: 'delete list Groceries', result: deletion }));
assert.equal(deletion.status, 'executed');
assert.equal(
  dataset.TodoList.some(row => row.id === 'delete-me'),
  false,
);
assert.equal(
  dataset.TodoItem.some(row => row.id === 'delete-child'),
  false,
);
console.info('Named list deletion passed, including its items.');

const named = await submit({ text: 'add item buy apples to Shopping', list: null });
assert.equal(named.status, 'executed');
assert.ok(
  dataset.TodoItem.some(item => item.title === 'buy apples' && item.list === 'evaluation-list'),
);
console.info('Named-list item creation without selection passed.');

// User-reported regression: a natural-language name is already an argument.
dataset.TodoList = ['Inbox', 'Later', 'Nueva', 'Sarasa', 'Supermercado', 'Other'].map(
  (name, index) => ({ id: `regression-${index}`, name, color: '#fff' }),
);
dataset.TodoItem = [];
const multiple = await submit({ text: 'delete list Nueva and "Other"', list: null });
console.info(JSON.stringify({ text: 'delete list Nueva and "Other"', result: multiple }));
assert.equal(multiple.status, 'unresolved');
assert.equal(dataset.TodoList.length, 6);
const single = await submit({ text: 'delete list Nueva', list: null });
console.info(JSON.stringify({ text: 'delete list Nueva', result: single }));
assert.equal(single.status, 'executed');
assert.equal(
  dataset.TodoList.some(row => row.name === 'Nueva'),
  false,
);
assert.equal(
  dataset.TodoList.some(row => row.name === 'Other'),
  true,
);
