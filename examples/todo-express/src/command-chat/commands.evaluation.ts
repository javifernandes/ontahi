// Run explicitly in a disposable process; never against a persistent Todo store.
import assert from 'node:assert/strict';

import { TodoApplication, todoModelRuntime } from '../graph.js';
import { TodoItem, TodoList } from '../todo.js';

if (TodoApplication.storage.kind !== 'in-memory' || process.env.TODO_AUTH_MODE !== 'disabled') {
  throw new Error('Evaluation requires TODO_STORAGE=in-memory and TODO_AUTH_MODE=disabled.');
}
if (!process.env.TODO_LLM_MODEL)
  throw new Error('Set TODO_LLM_MODEL to an installed Ollama model.');

const submit = (text: string) => todoModelRuntime!.submit({ text }, new AbortController().signal);
const dataset = TodoApplication.storage.dataset;
dataset.TodoList = [{ id: 'evaluation-list', name: 'Shopping', color: '#f5ddd5' }];
dataset.TodoItem = [
  { id: 'evaluation-tea', list: 'evaluation-list', title: 'buy bread', completed: false },
];
const list = TodoList.refById('evaluation-list');
for (const text of ['add item buy hamburgers to Shopping', 'complete buy bread']) {
  const start = Date.now();
  const result = await submit(text);
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
  const result = await submit(text);
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

const createdList = await submit('create list Holidays');
assert.equal(createdList.status, 'executed');
assert.equal(dataset.TodoList.filter(item => item.name === 'Holidays').length, 1);
console.info('List creation passed.');

await TodoList.createList({ id: 'delete-me', name: 'Groceries', color: '#fff' });
await TodoItem.createItem({
  id: 'delete-child',
  list: TodoList.refById('delete-me'),
  title: 'buy apples',
});
const deletion = await submit('delete list Groceries');
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

const named = await submit('add item buy apples to Shopping');
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
const multiple = await submit('delete list Nueva and "Other"');
console.info(JSON.stringify({ text: 'delete list Nueva and "Other"', result: multiple }));
assert.equal(multiple.status, 'unresolved');
assert.equal(dataset.TodoList.length, 6);
const single = await submit('delete list Nueva');
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

dataset.TodoItem = [{ id: 'banana-1', list: 'regression-0', title: 'banana', completed: false }];
const banana = await submit('complete banana');
console.info(JSON.stringify({ text: 'complete banana', result: banana }));
assert.equal(banana.status, 'executed');
assert.equal(dataset.TodoItem[0]!.completed, true);
dataset.TodoItem = [
  { id: 'banana-1', list: 'regression-0', title: 'banana', completed: false },
  { id: 'banana-2', list: 'regression-1', title: 'banana', completed: false },
];
const ambiguousBanana = await submit('complete banana');
console.info(JSON.stringify({ text: 'complete banana (two lists)', result: ambiguousBanana }));
assert.equal(ambiguousBanana.status, 'unresolved');
assert.ok(dataset.TodoItem.every(item => !item.completed));
const namedBanana = await submit('complete banana in Later');
console.info(JSON.stringify({ text: 'complete banana in Later', result: namedBanana }));
assert.equal(namedBanana.status, 'executed');
assert.deepEqual(
  dataset.TodoItem.map(item => item.completed),
  [false, true],
);
