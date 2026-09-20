import { createEntityRef, Selection } from '@ontahi/core/data-graph';
import { withInvocationContext } from '@ontahi/core/runtime/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { TodoApplication, todoCommands } from '../graph.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from '../todo-read-policies.js';
import { TodoItem, TodoList } from '../todo.js';

import type { ModelRequest } from './model-provider.js';
import { createTodoCommandService } from './service.js';

const principal = { subject: 'local-test', kind: 'user' as const };
const dataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') throw new Error('Requires in-memory storage.');
  return TodoApplication.storage.dataset;
};
const listRef = createEntityRef(TodoList, { id: 'list-1' });
const invoke = (text = 'agregar comprar pan') =>
  withInvocationContext({ principal }, () => TodoList.submitCommand({ text, list: listRef }));
const completion = (id: string) => ({
  status: 'resolved',
  invocation: {
    kind: 'invoke',
    operationId: 'TodoItem.setCompleted',
    input: {
      todos: Selection.references(TodoItem, [createEntityRef(TodoItem, { id })]).toJSON(),
      completed: true,
    },
  },
});
const addition = (request: ModelRequest) => {
  const context = JSON.parse(request.context);
  return {
    status: 'resolved',
    invocation: {
      kind: 'invoke',
      operationId: 'TodoItem.createItem',
      input: {
        id: context.newItemId,
        list: context.listRef,
        title: 'comprar pan',
      },
    },
  };
};

const bind = (generate: (request: ModelRequest) => Promise<unknown>) => {
  const service = createTodoCommandService({
    application: TodoApplication,
    read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>(todoGraphReadPolicies),
    provider: { generate },
  });
  vi.spyOn(todoCommands, 'interpret').mockImplementation(service.interpret);
  vi.spyOn(todoCommands, 'submit').mockImplementation(service.submit);
  return service;
};

beforeEach(() => {
  dataset().TodoList = [
    { id: 'list-1', name: 'Compras', color: '#fff' },
    { id: 'list-2', name: 'Other', color: '#fff' },
  ];
  dataset().TodoItem = [
    { id: 'yerba', list: 'list-1', title: 'comprar yerba', completed: false },
    { id: 'private', list: 'list-2', title: 'Other list content', completed: false },
  ];
});
afterEach(() => vi.restoreAllMocks());

describe('model-backed Todo commands', () => {
  it('interprets without effects and dispatches creation only on submission', async () => {
    const generate = vi.fn(async (request: ModelRequest) => addition(request));
    bind(generate);
    const proposal = await withInvocationContext({ principal }, () =>
      TodoList.interpretCommand({ text: 'agregar comprar pan', list: listRef }),
    );
    expect(proposal.ok).toBe(true);
    expect(dataset().TodoItem).toHaveLength(2);
    const result = await invoke();
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'executed', message: 'Item added.' },
    });
    expect(dataset().TodoItem).toHaveLength(3);
    expect(dataset().TodoItem?.[2]).toMatchObject({
      title: 'comprar pan',
      list: 'list-1',
      completed: false,
    });
    const context = JSON.parse(generate.mock.calls[0]![0].context);
    expect(context.items.map((item: { id: string }) => item.id)).toEqual(['yerba']);
    expect(
      context.operations.map((operation: { operationId: string }) => operation.operationId),
    ).toEqual(['TodoList.createList', 'TodoItem.createItem', 'TodoItem.setCompleted']);
    expect(generate.mock.calls[0]![0].context).not.toContain('Other list content');
  });

  it('completes one item through the existing operation', async () => {
    bind(async () => completion('yerba'));
    expect(await invoke('ya compré la yerba')).toMatchObject({
      ok: true,
      value: { status: 'executed' },
    });
    expect(dataset().TodoItem?.map(item => item.completed)).toEqual([true, false]);
  });

  it('can replace interpretation with code without changing operation callers', async () => {
    bind(async () => {
      throw new Error('Model should not run');
    });
    vi.mocked(todoCommands.interpret).mockResolvedValue({
      status: 'unresolved',
      reason: 'Code needs a target.',
    });
    expect(await invoke()).toMatchObject({
      ok: true,
      value: { status: 'unresolved', message: 'Code needs a target.' },
    });
    expect(dataset().TodoItem).toHaveLength(2);
  });

  it('keeps ambiguous and missing requests unresolved', async () => {
    bind(async () => ({ status: 'unresolved', reason: 'Which item?' }));
    expect(await invoke()).toMatchObject({ ok: true, value: { status: 'unresolved' } });
    expect(dataset().TodoItem).toHaveLength(2);
  });

  it('rejects duplicate titles even when the model selects one', async () => {
    dataset().TodoItem = [
      ...dataset().TodoItem!,
      { id: 'yerba-2', list: 'list-1', title: 'comprar yerba', completed: false },
    ];
    bind(async () => completion('yerba'));
    expect(await invoke()).toMatchObject({ ok: true, value: { status: 'unresolved' } });
    expect(dataset().TodoItem?.every(item => item.completed === false)).toBe(true);
  });

  it.each([
    [
      'unknown operation',
      {
        status: 'resolved',
        invocation: { kind: 'invoke', operationId: 'TodoItem.deleteAll', input: {} },
      },
    ],
    ['wrong list', completion('private')],
    ['missing target', completion('nonexistent')],
    ['invalid shape', { invocations: [completion('yerba')] }],
  ])('rejects %s without effects', async (_name, output) => {
    bind(async () => output);
    expect(await invoke()).toMatchObject({ ok: false });
    expect(dataset().TodoItem?.every(item => item.completed === false)).toBe(true);
    expect(dataset().TodoItem).toHaveLength(2);
  });

  it('does not call the provider for denied authority', async () => {
    const generate = vi.fn(async (request: ModelRequest) => addition(request));
    bind(generate);
    const result = await withInvocationContext({ principal: null }, () =>
      TodoList.submitCommand({ text: 'add bread', list: listRef }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not disclose context when read policy denies it', async () => {
    const generate = vi.fn(async (request: ModelRequest) => addition(request));
    const service = createTodoCommandService({
      application: TodoApplication,
      read: TodoApplication.createGraphReadDispatcher<TodoGraphReadAuthority>([]),
      provider: { generate },
    });
    await expect(
      service.interpret({ text: 'add bread', listId: 'list-1' }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'context_unavailable' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not use an incomplete candidate set', async () => {
    dataset().TodoItem = Array.from({ length: 101 }, (_, i) => ({
      id: String(i),
      list: 'list-1',
      title: `Item ${i}`,
      completed: false,
    }));
    const generate = vi.fn(async () => completion('0'));
    bind(generate);
    expect(await invoke()).toMatchObject({ ok: true, value: { status: 'unresolved' } });
    expect(generate).not.toHaveBeenCalled();
  });

  it('rechecks a target moved during inference', async () => {
    bind(async () => {
      dataset().TodoItem![0]!.list = 'list-2';
      return completion('yerba');
    });
    expect(await invoke()).toMatchObject({ ok: true, value: { status: 'unresolved' } });
    expect(dataset().TodoItem![0]!.completed).toBe(false);
  });

  it('surfaces dispatcher failure instead of claiming success', async () => {
    bind(async request => {
      dataset().TodoList = [];
      return addition(request);
    });
    expect(await invoke()).toMatchObject({ ok: false });
    expect(dataset().TodoItem).toHaveLength(2);
  });
});

it('creates a requested list instead of an item', async () => {
  bind(async request => {
    const context = JSON.parse(request.context);
    return {
      status: 'resolved',
      invocation: {
        kind: 'invoke',
        operationId: 'TodoList.createList',
        input: {
          id: context.newListId,
          name: 'Supermercado',
          color: '#f5ddd5',
        },
      },
    };
  });
  expect(await invoke('crear lista nueva llamada Supermercado')).toMatchObject({
    ok: true,
    value: { status: 'executed' },
  });
  expect(dataset().TodoList?.map(list => list.name)).toEqual(['Compras', 'Other', 'Supermercado']);
  expect(dataset().TodoItem).toHaveLength(2);
});

it('can create a list without selecting an existing list', async () => {
  bind(async request => {
    const context = JSON.parse(request.context);
    expect(context.list).toBeNull();
    expect(context.operations.map((op: { operationId: string }) => op.operationId)).toEqual([
      'TodoList.createList',
    ]);
    return {
      status: 'resolved',
      invocation: {
        kind: 'invoke',
        operationId: 'TodoList.createList',
        input: {
          id: context.newListId,
          name: 'Supermercado',
          color: '#f5ddd5',
        },
      },
    };
  });
  const result = await withInvocationContext({ principal }, () =>
    TodoList.submitCommand({ text: 'crear lista nueva llamada Supermercado', list: null }),
  );
  expect(result).toMatchObject({ ok: true, value: { status: 'executed' } });
  expect(dataset().TodoItem).toHaveLength(2);
});

it('rejects an item proposal without a selected list', async () => {
  bind(async request => addition(request));
  const result = await withInvocationContext({ principal }, () =>
    TodoList.submitCommand({ text: 'agregar pan', list: null }),
  );
  expect(result).toMatchObject({ ok: false });
  expect(dataset().TodoItem).toHaveLength(2);
});
