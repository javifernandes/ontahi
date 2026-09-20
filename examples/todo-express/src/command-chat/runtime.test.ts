import {
  withInvocationContext,
  type ModelProvider,
  type ModelCommandRuntime,
} from '@ontahi/core/runtime/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoApplication } from '../graph.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from '../todo-read-policies.js';

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
  invocation: { kind: 'invoke', operationId, input },
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
describe('Todo graph instruction runtime', () => {
  it('uses reflected descriptions and binds creation arguments', async () => {
    const generate = vi.fn(async (_request: Parameters<ModelProvider['generate']>[0]) =>
      proposal('TodoItem.createItem', { title: 'buy bread', listName: 'Shopping' }),
    );
    bind(generate);
    expect(await submit()).toEqual({ status: 'executed', message: 'Item added.' });
    expect(dataset().TodoItem?.[2]).toMatchObject({
      title: 'buy bread',
      list: 'list-1',
      completed: false,
    });
    const catalog = JSON.parse(generate.mock.calls[0]![0].context).operations;
    expect(
      catalog.find((op: { operationId: string }) => op.operationId === 'TodoItem.createItem')
        .description,
    ).toBe(TodoApplication.resolveOperation('TodoItem.createItem')!.description);
    expect(TodoApplication.resolveOperation('TodoList.submitCommand')).toBeUndefined();
    expect(TodoApplication.resolveOperation('TodoList.interpretCommand')).toBeUndefined();
  });
  it('adds to a named list without UI selection', async () => {
    bind(async () => proposal('TodoItem.createItem', { title: 'buy bread', listName: 'Other' }));
    expect(await submit('add buy bread to Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoItem?.[2]?.list).toBe('list-2');
  });
  it('requires a target for creation when none is supplied', async () => {
    bind(async () => proposal('TodoItem.createItem', { title: 'buy bread' }));
    expect(await submit('add buy bread')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('completes a unique item without a selected list', async () => {
    bind(async () => proposal('TodoItem.setCompleted', { title: 'buy tea' }));
    await submit('complete buy tea');
    expect(dataset().TodoItem?.map(item => item.completed)).toEqual([true, false]);
  });
  it('resolves a completion in a named list', async () => {
    bind(async () => proposal('TodoItem.setCompleted', { title: 'buy apples', listName: 'Other' }));
    await submit('complete buy apples in Other');
    expect(dataset().TodoItem?.map(item => item.completed)).toEqual([false, true]);
  });
  it('deletes a named list and its items without selection', async () => {
    bind(async () => proposal('TodoItem.deleteList', { name: 'Other' }));
    await submit('delete list Other');
    expect(dataset().TodoList?.map(list => list.id)).toEqual(['list-1']);
    expect(dataset().TodoItem?.map(item => item.id)).toEqual(['tea']);
  });
  it('creates a list without selection', async () => {
    bind(async () => proposal('TodoList.createList', { name: 'Holidays' }));
    await submit('create list Holidays');
    expect(dataset().TodoList?.map(list => list.name)).toEqual(['Shopping', 'Other', 'Holidays']);
  });
  it.each(['buy coffee', 'buy milk'])(
    'keeps missing and ambiguous titles unresolved: %s',
    async title => {
      dataset().TodoItem = [
        ...dataset().TodoItem!,
        { id: 'milk-1', list: 'list-1', title: 'buy milk', completed: false },
        { id: 'milk-2', list: 'list-2', title: 'buy milk', completed: false },
      ];
      bind(async () => proposal('TodoItem.setCompleted', { title }));
      expect(await submit(`complete ${title}`)).toMatchObject({
        status: 'unresolved',
        message: expect.stringContaining('which list'),
      });
      expect(dataset().TodoItem?.every(item => !item.completed)).toBe(true);
    },
  );
  it('keeps duplicate list names unresolved', async () => {
    dataset().TodoList = [
      ...dataset().TodoList!,
      { id: 'duplicate', name: 'Other', color: '#fff' },
    ];
    bind(async () => proposal('TodoItem.deleteList', { name: 'Other' }));
    expect(await submit('delete list Other')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList).toHaveLength(3);
  });
  it.each([
    proposal('TodoItem.deleteAll', {}),
    proposal('TodoItem.createItem', { itemId: 'bad' }),
    { invocations: [] },
  ])('rejects invalid proposals without effects', async output => {
    bind(async () => output);
    await expect(submit()).rejects.toHaveProperty('code');
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('authenticates before reading or calling the provider', async () => {
    const generate = vi.fn();
    bind(generate);
    await expect(
      withInvocationContext({ principal: null }, () =>
        runtime.submit({ text: 'add bread' }, new AbortController().signal),
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
      return proposal('TodoItem.setCompleted', { title: 'buy tea' });
    });
    expect(await submit()).toMatchObject({ status: 'unresolved' });
  });
  it('surfaces dispatch/context failure without claiming success', async () => {
    bind(async () => {
      dataset().TodoList = [];
      return proposal('TodoItem.createItem', { title: 'buy bread', listName: 'Shopping' });
    });
    await expect(submit()).rejects.toHaveProperty('code');
    expect(dataset().TodoItem).toHaveLength(2);
  });
});

it('completes banana across lists and resolves ambiguity with an explicit list', async () => {
  dataset().TodoItem = [{ id: 'banana-1', list: 'list-1', title: 'banana', completed: false }];
  bind(async () => proposal('TodoItem.setCompleted', { title: 'banana' }));
  expect(await submit('complete banana')).toMatchObject({ status: 'executed' });
  dataset().TodoItem = [
    { id: 'banana-1', list: 'list-1', title: 'banana', completed: false },
    { id: 'banana-2', list: 'list-2', title: 'banana', completed: false },
  ];
  expect(await submit('complete banana')).toMatchObject({
    status: 'unresolved',
    message: expect.stringContaining('which list'),
  });
  expect(dataset().TodoItem?.every(item => !item.completed)).toBe(true);
  bind(async () => proposal('TodoItem.setCompleted', { title: 'banana', listName: 'Other' }));
  expect(await submit('complete banana in Other')).toMatchObject({ status: 'executed' });
  expect(dataset().TodoItem?.map(item => item.completed)).toEqual([false, true]);
});

it('does not let the model invent a list to disambiguate an item', async () => {
  dataset().TodoItem = [
    { id: 'banana-1', list: 'list-1', title: 'banana', completed: false },
    { id: 'banana-2', list: 'list-2', title: 'banana', completed: false },
  ];
  bind(async () => proposal('TodoItem.setCompleted', { title: 'banana', listName: 'Other' }));
  expect(await submit('complete banana')).toMatchObject({
    status: 'unresolved',
    message: expect.stringContaining('which list'),
  });
  expect(dataset().TodoItem?.every(item => !item.completed)).toBe(true);
});

it('ignores an invented list qualifier when the title is globally unique', async () => {
  bind(async () => proposal('TodoItem.setCompleted', { title: 'buy tea', listName: 'Other' }));
  expect(await submit('complete buy tea')).toMatchObject({ status: 'executed' });
  expect(dataset().TodoItem?.map(item => item.completed)).toEqual([true, false]);
});
