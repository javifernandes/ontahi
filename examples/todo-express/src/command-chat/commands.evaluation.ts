// Run explicitly in a disposable process; never against a persistent Todo store.
import assert from 'node:assert/strict';

import { TodoApplication, todoModelRuntime } from '../graph.js';
import { TodoItem, TodoList } from '../todo.js';

if (TodoApplication.storage.kind !== 'in-memory' || process.env.TODO_AUTH_MODE !== 'disabled') {
  throw new Error('Evaluation requires TODO_STORAGE=in-memory and TODO_AUTH_MODE=disabled.');
}
if (!process.env.TODO_LLM_MODEL)
  throw new Error('Set TODO_LLM_MODEL to an installed Ollama model.');

const submit = (text: string, language = 'en-US') =>
  todoModelRuntime!.submit({ text, language }, new AbortController().signal);
const dataset = TodoApplication.storage.dataset;
// Individual deletion uses the canonical graph command, not a domain operation.
for (const language of ['es-ES', 'en-US']) {
  dataset.TodoList = [{ id: 'delete-list', name: 'Manuela', color: '#fff' }];
  dataset.TodoItem = [
    { id: 'delete-target', list: 'delete-list', title: 'comida', completed: false },
    { id: 'delete-sibling', list: 'delete-list', title: 'water', completed: false },
  ];
  const text =
    language === 'es-ES'
      ? 'borrar ítem comida de lista Manuela'
      : 'delete item comida from list Manuela';
  const result = await submit(text, language);
  console.info(JSON.stringify({ text, result }));
  assert.equal(result.status, 'executed');
  assert.equal(dataset.TodoList.length, 1);
  assert.deepEqual(
    dataset.TodoItem.map(item => item.id),
    ['delete-sibling'],
  );
}

// Regression: realistic references plus graph context exhausted Ollama's default 4k window.
// Synthetic data only; retain the reported Spanish request to cover its interpretation too.
const contextListId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
dataset.TodoList = ['Limpieza', 'Home', 'Shopping', 'Work', 'Later'].map((name, index) => ({
  id: contextListId(index),
  name,
  color: '#fff',
}));
dataset.TodoItem = Array.from({ length: 9 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  list: contextListId(index % 5),
  title: `Task ${index + 1}`,
  completed: false,
}));
const beforeContextRename = JSON.stringify(dataset.TodoItem);
for (const language of ['es-ES', 'en-US']) {
  for (const name of ['arte', 'otros']) {
    dataset.TodoList = dataset.TodoList.map(row =>
      row.id === contextListId(0) ? { ...row, name: 'Limpieza' } : row,
    );
    const start = Date.now();
    const contextRename = await submit(`renombrar lista limpieza a ${name}`, language);
    console.info(
      JSON.stringify({
        text: `Spanish rename to ${name} with UUID graph context`,
        language,
        elapsedMs: Date.now() - start,
        result: contextRename,
      }),
    );
    assert.equal(contextRename.status, 'executed');
    assert.equal(dataset.TodoList.length, 5, 'Renaming must not create a list.');
    assert.equal(dataset.TodoList.find(row => row.id === contextListId(0))?.name, name);
    assert.equal(JSON.stringify(dataset.TodoItem), beforeContextRename);
  }
}

// Reported sequence: renaming an item must remain distinct from creating a new list.
dataset.TodoItem = dataset.TodoItem.map((row, index) =>
  index === 0 ? { ...row, title: 'compras' } : row,
);
const quotedItemId = dataset.TodoItem[0]!.id;
const quotedRename = await submit('renombrar item "compras" a "papel higienico"', 'es-ES');
console.info(JSON.stringify({ text: 'Quoted Spanish item rename', result: quotedRename }));
assert.equal(quotedRename.status, 'executed');
assert.equal(dataset.TodoItem.find(row => row.id === quotedItemId)?.title, 'papel higienico');
const beforeSpanishCreation = JSON.stringify(dataset.TodoItem);
const beforeSpanishListCount = dataset.TodoList.length;
const spanishListCreation = await submit('Crear lista "comedor"', 'es-ES');
console.info(JSON.stringify({ text: 'Quoted Spanish list creation', result: spanishListCreation }));
assert.equal(spanishListCreation.status, 'executed');
assert.equal(dataset.TodoList.length, beforeSpanishListCount + 1);
assert.equal(dataset.TodoList.filter(row => row.name === 'comedor').length, 1);
assert.equal(JSON.stringify(dataset.TodoItem), beforeSpanishCreation);

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

const beforeHelp = JSON.stringify(dataset);
const help = await submit('what things can I do ?');
console.info(JSON.stringify({ text: 'what things can I do ?', result: help }));
assert.equal(help.status, 'answered');
assert.doesNotMatch(
  help.message,
  /TodoItem|TodoList|operationId|schema|unresolved|incomplete|banana|Inbox/i,
);
assert.match(help.message, /creat/i);
assert.match(help.message, /delet/i);
assert.match(help.message, /complet|done/i);
assert.ok(help.message.length < 700, 'Help should be concise.');
assert.equal(JSON.stringify(dataset), beforeHelp);

await TodoList.createList({ id: 'house-list', name: 'house', color: '#fff' });
const door = await submit('now add item fix the door in house');
console.info(JSON.stringify({ text: 'now add item fix the door in house', result: door }));
assert.equal(door.status, 'executed');
assert.ok(
  dataset.TodoItem.some(item => item.title === 'fix the door' && item.list === 'house-list'),
);

const spanishHelp = await submit('what things can I do?', 'es-ES');
console.info(JSON.stringify({ text: 'help (Spanish selected)', result: spanishHelp }));
assert.equal(spanishHelp.status, 'answered');
assert.match(spanishHelp.message, /Podés/);
assert.match(spanishHelp.message, /Crear una lista/);
const spanishAdd = await submit('now add item paint the fence in house', 'es-ES');
console.info(JSON.stringify({ text: 'add task (Spanish selected)', result: spanishAdd }));
assert.equal(spanishAdd.status, 'executed');
assert.equal(spanishAdd.message, 'Ítem agregado.');
assert.ok(
  dataset.TodoItem.some(item => item.title === 'paint the fence' && item.list === 'house-list'),
);
const missing = await submit('add item buy nails', 'es-ES');
console.info(JSON.stringify({ text: 'missing destination (Spanish selected)', result: missing }));
assert.equal(missing.status, 'unresolved');
assert.match(missing.message, /lista/i);

const listRename = await submit('rename list house to Home');
console.info(JSON.stringify({ text: 'rename list house to Home', result: listRename }));
assert.equal(listRename.status, 'executed');
assert.equal(dataset.TodoList.find(list => list.id === 'house-list')?.name, 'Home');
const itemRename = await submit('rename item fix the door to fix the front door');
console.info(
  JSON.stringify({ text: 'rename item fix the door to fix the front door', result: itemRename }),
);
assert.equal(itemRename.status, 'executed');
assert.ok(
  dataset.TodoItem.some(item => item.title === 'fix the front door' && item.list === 'house-list'),
);
const beforeAmbiguous = JSON.stringify(dataset);
const ambiguousRename = await submit('rename item banana to ripe banana');
console.info(
  JSON.stringify({ text: 'rename item banana to ripe banana', result: ambiguousRename }),
);
assert.equal(ambiguousRename.status, 'unresolved');
assert.equal(JSON.stringify(dataset), beforeAmbiguous);
const qualifiedRename = await submit('rename item banana in Later to ripe banana', 'es-ES');
console.info(
  JSON.stringify({ text: 'rename item banana in Later to ripe banana', result: qualifiedRename }),
);
assert.equal(qualifiedRename.status, 'executed');
assert.equal(qualifiedRename.message, 'Ítem renombrado.');
assert.equal(dataset.TodoItem.find(item => item.id === 'banana-2')?.title, 'ripe banana');
