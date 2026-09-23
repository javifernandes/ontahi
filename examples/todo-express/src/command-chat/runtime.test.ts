import { createEntityRef, Selection, toGraphCommandRequest } from '@ontahi/core/data-graph';
import {
  withInvocationContext,
  type ModelProvider,
  type ModelCommandRuntime,
} from '@ontahi/core/runtime/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoApplication } from '../graph.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

import { createTodoModelRuntime } from './runtime.js';
const principal = { subject: 'local-test', kind: 'user' as const };
const dataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') throw new Error('Requires memory.');
  return TodoApplication.storage.dataset;
};
let runtime: ModelCommandRuntime;
const bind = (generate: ModelProvider['generate']) =>
  (runtime = createTodoModelRuntime({
    application: TodoApplication,
    read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>(todoGraphReadPolicies),
    provider: { generate },
  }));
const proposal = (operationId: string, input: unknown) => ({
  status: 'resolved',
  request: { kind: 'invoke', operationId, input },
});
const submit = (text = 'add buy bread to Shopping') =>
  withInvocationContext({ principal }, () =>
    runtime.submit({ text }, new AbortController().signal),
  );
beforeEach(() => {
  dataset().TodoList = [
    { id: 'list-1', name: 'Shopping', color: '#fff' },
    { id: 'list-2', name: 'Other', color: '#fff' },
  ];
  dataset().TodoItem = [
    { id: 'tea', list: 'list-1', title: 'buy tea', completed: false },
    { id: 'other', list: 'list-2', title: 'buy apples', completed: false },
  ];
});
const list = (id = 'list-1') => createEntityRef(TodoList, { id });
const complete = (id = 'tea') =>
  proposal('TodoItem.setCompleted', {
    todos: Selection.references(TodoItem, [createEntityRef(TodoItem, { id })]).toJSON(),
    completed: true,
  });
const create = (id = 'list-1') =>
  proposal('TodoItem.createItem', { id: 'new-item', title: 'buy bread', list: list(id) });
const rename = (entityName: 'TodoList' | 'TodoItem', id: string, before: string, after: string) => {
  const key = entityName === 'TodoList' ? 'name' : 'title';
  return {
    status: 'resolved',
    request: toGraphCommandRequest({
      kind: 'entity-mutation-command',
      action: 'update',
      entityName,
      target: createEntityRef(entityName === 'TodoList' ? TodoList : TodoItem, { id }),
      values: { [key]: after },
      if: { [key]: before },
    }),
  };
};

const removeItem = (id = 'tea', title = 'buy tea') => ({
  status: 'resolved',
  request: toGraphCommandRequest({
    kind: 'entity-mutation-command',
    action: 'delete',
    entityName: 'TodoItem',
    target: createEntityRef(TodoItem, { id }),
    if: { title },
  }),
});

describe('Todo canonical model requests', () => {
  it('deletes the named item while preserving lists and siblings', async () => {
    dataset().TodoList![0]!.name = 'Manuela';
    dataset().TodoItem![0]!.title = 'comida';
    const lists = structuredClone(dataset().TodoList);
    bind(async () => removeItem('tea', 'comida'));
    expect(await submit('borrar ítem comida de lista Manuela')).toEqual({
      status: 'executed',
      message: 'Item deleted.',
    });
    expect(dataset().TodoItem).toEqual([
      { id: 'other', list: 'list-2', title: 'buy apples', completed: false },
    ]);
    expect(dataset().TodoList).toEqual(lists);
  });
  it('requires an explicit matching list for duplicate item deletion', async () => {
    dataset().TodoItem![1]!.title = 'buy tea';
    bind(async () => removeItem());
    expect(await submit('delete item buy tea')).toMatchObject({ status: 'unresolved' });
    expect(await submit('delete item buy tea from list Other')).toMatchObject({
      status: 'unresolved',
    });
    expect(dataset().TodoItem).toHaveLength(2);
    expect(await submit('delete item buy tea from list Shopping')).toMatchObject({
      status: 'executed',
    });
    expect(dataset().TodoItem).toHaveLength(1);
  });
  it('rejects a stale deletion target after interpretation', async () => {
    bind(async () => {
      dataset().TodoItem![0]!.title = 'changed';
      return removeItem();
    });
    expect(await submit('delete item buy tea')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('exposes real operation inputs and refs, then dispatches creation unchanged', async () => {
    const generate = vi.fn(async (_request: Parameters<ModelProvider['generate']>[0]) => create());
    bind(generate);
    expect(await submit()).toEqual({ status: 'executed', message: 'Item added.' });
    expect(dataset().TodoItem?.at(-1)).toMatchObject({
      id: 'new-item',
      title: 'buy bread',
      list: 'list-1',
      completed: false,
    });
    const catalog = JSON.parse(generate.mock.calls[0]![0].context);
    const operation = catalog.operations.find(
      (op: { operationId: string }) => op.operationId === 'TodoItem.createItem',
    );
    expect(operation.description).toBe(
      TodoApplication.resolveOperation('TodoItem.createItem')!.description,
    );
    expect(operation.input.properties).toHaveProperty('list');
    expect(operation.input.properties).not.toHaveProperty('listName');
    expect(catalog.context.lists[0].ref).toEqual(list());
  });
  it('adds to a named list without UI selection', async () => {
    bind(async () => create('list-2'));
    expect(await submit('add buy bread to Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoItem?.at(-1)?.list).toBe('list-2');
  });
  it('does not accept a guessed list for creation', async () => {
    bind(async () => create());
    expect(await submit('add buy bread')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('completes a unique item across lists', async () => {
    bind(async () => complete());
    expect(await submit('complete buy tea')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoItem?.map(item => item.completed)).toEqual([true, false]);
  });
  it('does not let a chosen ref bypass ambiguity; accepts an explicit list', async () => {
    dataset().TodoItem = [
      ...dataset().TodoItem!,
      { id: 'duplicate', list: 'list-2', title: 'buy tea', completed: false },
    ];
    bind(async () => complete('duplicate'));
    expect(await submit('complete buy tea')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem?.every(item => !item.completed)).toBe(true);
    expect(await submit('complete buy tea in Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoItem?.at(-1)?.completed).toBe(true);
  });
  it('deletes a named list and its items', async () => {
    bind(async () => proposal('TodoItem.deleteList', { list: list('list-2') }));
    expect(await submit('delete list Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoList?.map(row => row.id)).toEqual(['list-1']);
    expect(dataset().TodoItem?.map(row => row.id)).toEqual(['tea']);
  });
  it('rejects partial deletion and duplicate list names', async () => {
    bind(async () => proposal('TodoItem.deleteList', { list: list('list-2') }));
    expect(await submit('delete list Shopping and Other')).toMatchObject({ status: 'unresolved' });
    dataset().TodoList = [
      ...dataset().TodoList!,
      { id: 'duplicate', name: 'Other', color: '#fff' },
    ];
    expect(await submit('delete list Other')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList).toHaveLength(3);
  });
  it('creates a list with the declared input', async () => {
    bind(async () =>
      proposal('TodoList.createList', { id: 'new-list', name: 'Holidays', color: '#f5ddd5' }),
    );
    expect(await submit('create list Holidays')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoList?.at(-1)?.name).toBe('Holidays');
  });
  it.each([
    proposal('TodoItem.deleteAll', {}),
    proposal('TodoItem.createItem', { title: 'bread', listName: 'Shopping' }),
    {
      status: 'update',
      entityName: 'TodoList',
      target: { name: 'Shopping' },
      values: { name: 'New' },
    },
    {
      status: 'resolved',
      invocation: { kind: 'invoke', operationId: 'TodoItem.deleteList', input: { name: 'Other' } },
    },
    create('foreign'),
  ])('rejects invalid or legacy payloads without effects', async result => {
    bind(async () => result);
    await expect(submit()).rejects.toHaveProperty('code');
    expect(dataset().TodoList).toHaveLength(2);
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('authenticates before disclosure', async () => {
    const generate = vi.fn();
    bind(generate);
    await expect(
      withInvocationContext({ principal: null }, () =>
        runtime.submit({ text: 'help' }, new AbortController().signal),
      ),
    ).rejects.toHaveProperty('code', 'command_unauthorized');
    expect(generate).not.toHaveBeenCalled();
  });
  it('honors graph read policies', async () => {
    const generate = vi.fn();
    runtime = createTodoModelRuntime({
      application: TodoApplication,
      read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>([]),
      provider: { generate },
    });
    await expect(submit()).rejects.toHaveProperty('code', 'context_unavailable');
    expect(generate).not.toHaveBeenCalled();
  });
  it('refuses incomplete context', async () => {
    dataset().TodoItem = Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      list: 'list-1',
      title: `Item ${i}`,
      completed: false,
    }));
    const generate = vi.fn();
    bind(generate);
    expect(await submit()).toMatchObject({ status: 'unresolved' });
    expect(generate).not.toHaveBeenCalled();
  });
  it('rechecks targets after inference', async () => {
    bind(async () => {
      dataset().TodoItem = [];
      return complete();
    });
    expect(await submit('complete buy tea')).toMatchObject({ status: 'unresolved' });
  });
  it('localizes help and execution without translating entity data', async () => {
    const request = (text: string) =>
      withInvocationContext({ principal }, () =>
        runtime.submit({ text, language: 'es-ES' }, new AbortController().signal),
      );
    bind(async () => ({ status: 'help' }));
    expect(await request('What can I do?')).toMatchObject({
      status: 'answered',
      message: expect.stringContaining('Renombrar una lista.'),
    });
    bind(async () => create());
    expect(await request('add buy bread to Shopping')).toEqual({
      status: 'executed',
      message: 'Ítem agregado.',
    });
    expect(dataset().TodoItem?.at(-1)?.title).toBe('buy bread');
  });
  it('renames lists and completed items through canonical graph commands', async () => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', 'Groceries'));
    expect(await submit('rename list Shopping to Groceries')).toEqual({
      status: 'executed',
      message: 'List renamed.',
    });
    dataset().TodoItem![0]!.completed = true;
    bind(async () => rename('TodoItem', 'tea', 'buy tea', 'buy green tea'));
    expect(await submit('rename item buy tea to buy green tea')).toMatchObject({
      status: 'executed',
    });
    expect(dataset().TodoItem![0]).toMatchObject({ title: 'buy green tea', completed: true });
  });
  it('requires disambiguation even with a valid rename ref', async () => {
    dataset().TodoItem = [
      ...dataset().TodoItem!,
      { id: 'duplicate', list: 'list-2', title: 'buy tea', completed: false },
    ];
    bind(async () => rename('TodoItem', 'duplicate', 'buy tea', 'buy green tea'));
    expect(await submit('rename item buy tea to buy green tea')).toMatchObject({
      status: 'unresolved',
    });
    expect(await submit('rename item buy tea in Other to buy green tea')).toMatchObject({
      status: 'executed',
    });
    expect(dataset().TodoItem![0]!.title).toBe('buy tea');
  });
  it('does not use a list inside the replacement title to disambiguate', async () => {
    dataset().TodoItem = [
      ...dataset().TodoItem!,
      { id: 'duplicate', list: 'list-2', title: 'buy tea', completed: false },
    ];
    bind(async () => rename('TodoItem', 'duplicate', 'buy tea', 'buy tea in Other'));
    expect(await submit('rename item buy tea to buy tea in Other')).toMatchObject({
      status: 'unresolved',
    });
    expect(dataset().TodoItem!.filter(item => item.title === 'buy tea')).toHaveLength(2);
  });
  it('rejects stale values, foreign refs and newly ambiguous rename targets', async () => {
    for (const change of [
      () => {
        dataset().TodoList![0]!.name = 'Changed';
      },
      () => {
        dataset().TodoList = [
          ...dataset().TodoList!,
          { id: 'duplicate', name: 'Shopping', color: '#fff' },
        ];
      },
    ]) {
      dataset().TodoList = [{ id: 'list-1', name: 'Shopping', color: '#fff' }];
      bind(async () => {
        change();
        return rename('TodoList', 'list-1', 'Shopping', 'Groceries');
      });
      expect(await submit('rename list Shopping to Groceries')).toMatchObject({
        status: 'unresolved',
      });
    }
    bind(async () => rename('TodoList', 'foreign', 'Shopping', 'Groceries'));
    expect(await submit('rename list Shopping to Groceries')).toMatchObject({
      status: 'unresolved',
    });
  });
  it.each(['', 'archive'])('rejects invalid entity values: %s', async name => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', name));
    await expect(submit()).rejects.toHaveProperty('code');
    expect(dataset().TodoList![0]!.name).toBe('Shopping');
  });
  it('does not expose color, deletion, or missing write preconditions as graph commands', async () => {
    for (const patch of [{ values: { color: '#f00' } }, { action: 'delete' }, { if: undefined }]) {
      const result = rename('TodoList', 'list-1', 'Shopping', 'Groceries');
      bind(async () => ({
        ...result,
        request: { ...result.request, command: { ...result.request.command, ...patch } },
      }));
      await expect(submit()).rejects.toHaveProperty('code');
    }
    expect(dataset().TodoList![0]!.name).toBe('Shopping');
  });
});
