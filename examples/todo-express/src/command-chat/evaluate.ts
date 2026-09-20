// Run explicitly in a disposable process; never against a persistent Todo store.
import assert from 'node:assert/strict';

import { TodoApplication } from '../graph.js';
import { TodoItem, TodoList } from '../todo.js';

if (TodoApplication.storage.kind !== 'in-memory' || process.env.TODO_AUTH_MODE !== 'disabled') {
  throw new Error('Evaluation requires TODO_STORAGE=in-memory and TODO_AUTH_MODE=disabled.');
}
if (!process.env.TODO_LLM_MODEL)
  throw new Error('Set TODO_LLM_MODEL to an installed Ollama model.');

const dataset = TodoApplication.storage.dataset;
dataset.TodoList = [{ id: 'evaluation-list', name: 'Compras', color: '#f5ddd5' }];
dataset.TodoItem = [
  { id: 'evaluation-yerba', list: 'evaluation-list', title: 'comprar yerba', completed: false },
];
const list = TodoList.refById('evaluation-list');
for (const text of ['agregar comprar pan', 'ya compré la yerba']) {
  const start = Date.now();
  const result = await TodoList.submitCommand({ text, list });
  console.info(
    JSON.stringify({
      model: process.env.TODO_LLM_MODEL,
      text,
      elapsedMs: Date.now() - start,
      result,
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.status, 'executed');
}
assert.equal(dataset.TodoItem.length, 2);
assert.equal(dataset.TodoItem[0]!.completed, true);
assert.match(String(dataset.TodoItem[1]!.title), /pan/i);

await TodoItem.createItem({ id: 'duplicate-1', list, title: 'comprar leche' });
await TodoItem.createItem({ id: 'duplicate-2', list, title: 'comprar leche' });
for (const text of ['ya compré la leche', 'ya compré el café']) {
  const start = Date.now();
  const result = await TodoList.submitCommand({ text, list });
  console.info(
    JSON.stringify({
      model: process.env.TODO_LLM_MODEL,
      text,
      elapsedMs: Date.now() - start,
      result,
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.status, 'unresolved');
}
assert.equal(dataset.TodoItem.filter(item => item.completed).length, 1);
console.info(
  'Real-model evaluation passed: create, complete, ambiguous, missing. No persistent data changed.',
);
