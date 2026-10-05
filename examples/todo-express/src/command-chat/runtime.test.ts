import {
  createEntityRef,
  mutateEntity,
  query,
  toGraphCommandRequest,
  toGraphReadRequest,
} from '@ontahi/core/data-graph';
import {
  withInvocationContext,
  type ModelProvider,
  type PreparedModelCommandRuntime,
} from '@ontahi/core/runtime/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TodoApplication } from '../graph.js';
import { TodoItem, TodoList } from '../todo.js';

import { createTodoModelRuntime } from './runtime.js';
const principal = { subject: 'local-test', kind: 'user' as const };
const dataset = () => {
  if (TodoApplication.storage.kind !== 'in-memory') throw new Error('Requires memory.');
  return TodoApplication.storage.dataset;
};
let runtime: PreparedModelCommandRuntime;
const bind = (generate: ModelProvider['generate']) =>
  (runtime = createTodoModelRuntime({
    application: TodoApplication,
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
const complete = (id = 'tea') => ({
  status: 'resolved' as const,
  request: toGraphCommandRequest(
    mutateEntity(TodoItem).update(
      createEntityRef(TodoItem, { id }),
      { completed: true },
      { if: { completed: false } },
    ),
  ),
});
const deleteList = (id = 'list-2', name = 'Other') => ({
  status: 'resolved' as const,
  request: toGraphCommandRequest(
    mutateEntity(TodoList).delete(createEntityRef(TodoList, { id }), { if: { name } }),
  ),
});
const create = (id = 'list-1', title = 'buy bread') => ({
  status: 'resolved' as const,
  request: toGraphCommandRequest(mutateEntity(TodoItem).create({ title, list: list(id) })),
});
const createList = (name = 'Holidays') => ({
  status: 'resolved' as const,
  request: toGraphCommandRequest(mutateEntity(TodoList).create({ name })),
});
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

const readIncompleteItems = (mode: 'run' | 'count' = 'run') => {
  const read = query(TodoItem)
    .where(item => item.completed.eq(false))
    .orderBy(item => item.title);
  return {
    status: 'resolved',
    request: toGraphReadRequest(mode === 'run' ? read.limit(100) : read, mode),
  };
};

describe('Todo canonical model requests', () => {
  it('deletes the named item while preserving lists and siblings', async () => {
    dataset().TodoList![0]!.name = 'Manuela';
    dataset().TodoItem![0]!.title = 'comida';
    const lists = structuredClone(dataset().TodoList);
    bind(async () => removeItem('tea', 'comida'));
    expect(await submit('borrar ítem comida de lista Manuela')).toEqual({
      status: 'executed',
      message: 'Item deleted.',
      request: removeItem('tea', 'comida').request,
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
  it('exposes the canonical create command and lets the receiver generate identity', async () => {
    const generate = vi.fn(async (_request: Parameters<ModelProvider['generate']>[0]) => create());
    bind(generate);
    expect(await submit()).toEqual({
      status: 'executed',
      message: 'Item added.',
      request: create().request,
    });
    expect(dataset().TodoItem?.at(-1)).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: 'buy bread',
      list: 'list-1',
      completed: false,
    });
    const catalog = JSON.parse(generate.mock.calls[0]![0].context);
    const command = catalog.commands.find(
      (candidate: { description: string }) => candidate.description === 'Add an item to a list.',
    );
    expect(command.request.properties.command.properties.values.properties).toHaveProperty('list');
    expect(command.request.properties.command.properties.values.properties).not.toHaveProperty(
      'id',
    );
    expect(catalog.context.lists[0].ref).toEqual(list());
    expect(catalog.reads.map((read: { description: string }) => read.description)).toContain(
      'List items, optionally filtered by completion, title, or list.',
    );
  });
  it('executes canonical graph reads and returns actual authorized data', async () => {
    bind(async () => readIncompleteItems());

    await expect(submit('show incomplete items')).resolves.toEqual({
      status: 'executed',
      message: '2 matching items:\n• buy apples\n• buy tea',
      request: readIncompleteItems().request,
      response: {
        kind: 'graph-read-result',
        value: [
          { id: 'other', list: list('list-2'), title: 'buy apples', completed: false },
          { id: 'tea', list: list('list-1'), title: 'buy tea', completed: false },
        ],
      },
    });
    expect(dataset().TodoItem).toHaveLength(2);
  });

  it('resolves an open Operation application through authorized entity search', async () => {
    const generate = vi.fn(async (_request: Parameters<ModelProvider['generate']>[0]) => ({
      status: 'application',
      application: {
        kind: 'operation-application',
        operationId: 'TodoList.completeAll',
        arguments: { list: { kind: 'hole', id: 'list' } },
      },
      bindings: { list: { kind: 'entity-match', text: 'Shopping' } },
    }));
    bind(generate);

    await expect(
      withInvocationContext({ principal }, () =>
        runtime.prepare({ text: 'complete everything in Shopping' }, new AbortController().signal),
      ),
    ).resolves.toMatchObject({
      status: 'proposed',
      request: {
        kind: 'invoke',
        operationId: 'TodoList.completeAll',
        input: { list: list() },
      },
    });
    expect(generate.mock.calls[0]![0].instructions).toContain(
      'directly matches the TodoList.completeAll Operation',
    );
    expect(generate.mock.calls[0]![0].instructions).toContain('completá todas las tareas de Inbox');
  });
  it('repairs a guessed duplicate list into an Operation application choice', async () => {
    dataset().TodoList![1]!.name = 'Shopping';
    const generate = vi
      .fn<ModelProvider['generate']>()
      .mockResolvedValueOnce(proposal('TodoList.completeAll', { list: list() }))
      .mockResolvedValueOnce({
        status: 'application',
        application: {
          kind: 'operation-application',
          operationId: 'TodoList.completeAll',
          arguments: { list: { kind: 'hole', id: 'list' } },
        },
        bindings: { list: { kind: 'entity-match', text: 'Shopping' } },
      });
    bind(generate);

    await expect(
      withInvocationContext({ principal }, () =>
        runtime.prepare(
          { text: 'Completá todas las tareas de Shopping', language: 'es-ES' },
          new AbortController().signal,
        ),
      ),
    ).resolves.toMatchObject({
      status: 'application-choice',
      choice: {
        holeId: 'list',
        options: [{ label: 'Shopping' }, { label: 'Shopping' }],
      },
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].prompt).toContain('Do not return a graph-read application.');
  });
  it('continues add item from list choice through title input without another model call', async () => {
    const generate = vi.fn(async () => ({
      status: 'application',
      application: {
        kind: 'operation-application',
        operationId: 'TodoItem.addItem',
        arguments: {
          list: { kind: 'hole', id: 'list' },
          title: { kind: 'hole', id: 'title' },
        },
      },
      bindings: {
        list: { kind: 'entity-choice', prompt: 'Which list?' },
        title: { kind: 'free-input', prompt: 'What should the item say?' },
      },
    }));
    bind(generate);
    const request = { text: 'add item' };
    const signal = new AbortController().signal;
    const inContext = <T>(run: () => Promise<T>) => withInvocationContext({ principal }, run);

    const prepared = await inContext(() => runtime.prepare(request, signal));
    expect(prepared).toMatchObject({
      status: 'application-choice',
      choice: { holeId: 'list', prompt: 'Which list?' },
    });
    if (prepared.status !== 'application-choice') throw new Error('Expected list choice.');
    const selected = await inContext(() =>
      runtime.continueApplication(request, prepared.choice, prepared.choice.options[0]!.id, signal),
    );
    expect(selected).toMatchObject({
      status: 'application-input',
      input: { holeId: 'title', prompt: 'What should the item say?' },
    });
    if (selected.status !== 'application-input') throw new Error('Expected title input.');
    const completed = await inContext(() =>
      runtime.submitApplicationInput(request, selected.input, 'Buy milk', signal),
    );
    expect(completed).toMatchObject({
      status: 'proposed',
      request: {
        kind: 'invoke',
        operationId: 'TodoItem.addItem',
        input: { list: list('list-1'), title: 'Buy milk' },
      },
    });
    if (completed.status !== 'proposed') throw new Error('Expected completed proposal.');
    await expect(
      inContext(() =>
        runtime.execute(request, completed.request, signal, { kind: 'choice-option' }),
      ),
    ).resolves.toMatchObject({ status: 'executed', message: 'Item added.' });
    expect(generate).toHaveBeenCalledOnce();
    expect(dataset().TodoItem).toContainEqual(
      expect.objectContaining({ list: 'list-1', title: 'Buy milk', completed: false }),
    );
  });
  it('uses the graph read result for counts instead of answering from prompt context', async () => {
    bind(async () => readIncompleteItems('count'));

    await expect(submit('how many incomplete items are there?')).resolves.toEqual({
      status: 'executed',
      message: '2 matching items.',
      request: readIncompleteItems('count').request,
      response: { kind: 'graph-read-result', value: 2 },
    });
  });
  it('adds to a named list without UI selection', async () => {
    bind(async () => create('list-2'));
    expect(await submit('add buy bread to Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoItem?.at(-1)?.list).toBe('list-2');
  });
  it('never creates an item by copying a bulk-completion request', async () => {
    dataset().TodoList![1]!.name = 'Later';
    const wrong = create('list-2', 'complete all items in Later');
    const generate = vi.fn<ModelProvider['generate']>(async () => wrong);
    bind(generate);

    await expect(submit('complete all items in Later')).resolves.toMatchObject({
      status: 'unresolved',
    });
    expect(dataset().TodoItem).toHaveLength(2);
    const catalog = JSON.parse(generate.mock.calls[0]![0].context);
    expect(catalog.commands).toEqual([]);
  });
  it('does not accept a guessed list for creation', async () => {
    bind(async () => create());
    expect(await submit('add buy bread')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('prepares canonical list choices when an item destination is missing', async () => {
    const choice = {
      status: 'choice' as const,
      prompt: 'Which list?',
      options: [
        { id: 'list-1', label: 'Shopping', request: create('list-1').request },
        { id: 'list-2', label: 'Other', request: create('list-2').request },
      ],
    };
    bind(async () => choice);

    await expect(
      withInvocationContext({ principal }, () =>
        runtime.prepare({ text: 'add buy bread', language: 'en-US' }, new AbortController().signal),
      ),
    ).resolves.toEqual(choice);
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
    bind(async () => deleteList());
    expect(await submit('delete list Other')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoList?.map(row => row.id)).toEqual(['list-1']);
    expect(dataset().TodoItem?.map(row => row.id)).toEqual(['tea']);
  });
  it('rejects partial deletion and duplicate list names', async () => {
    bind(async () => deleteList());
    expect(await submit('delete list Shopping and Other')).toMatchObject({ status: 'unresolved' });
    dataset().TodoList = [
      ...dataset().TodoList!,
      { id: 'duplicate', name: 'Other', color: '#fff' },
    ];
    expect(await submit('delete list Other')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList).toHaveLength(3);
  });
  it('creates a list with the declared input', async () => {
    bind(async () => createList());
    expect(await submit('create list Holidays')).toMatchObject({ status: 'executed' });
    expect(dataset().TodoList?.at(-1)).toMatchObject({ name: 'Holidays', color: '#f5ddd5' });
    expect(dataset().TodoList?.at(-1)?.id).toEqual(expect.any(String));
  });
  it('rejects invented creation values', async () => {
    bind(async () => createList());
    expect(await submit('create list Vacation')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList).toHaveLength(2);

    bind(async () => create());
    expect(await submit('add buy milk to Shopping')).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it('allows capitalization differences from speech recognition', async () => {
    bind(async () => createList());
    expect(await submit('create list holidays')).toMatchObject({ status: 'executed' });
  });
  it.each([
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
  ])('rejects invalid or legacy payloads without effects', async result => {
    bind(async () => result);
    await expect(submit()).rejects.toHaveProperty('code');
    expect(dataset().TodoList).toHaveLength(2);
    expect(dataset().TodoItem).toHaveLength(2);
  });
  it.each([
    proposal('TodoItem.deleteAll', {}),
    proposal('TodoItem.createItem', { title: 'bread', listName: 'Shopping' }),
    create('foreign'),
  ])('keeps out-of-scope proposals unresolved and without effects', async result => {
    bind(async () => result);
    expect(await submit()).toMatchObject({ status: 'unresolved' });
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
      request: create().request,
    });
    expect(dataset().TodoItem?.at(-1)?.title).toBe('buy bread');
  });
  it('renames lists and completed items through canonical graph commands', async () => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', 'Groceries'));
    expect(await submit('rename list Shopping to Groceries')).toEqual({
      status: 'executed',
      message: 'List renamed.',
      request: rename('TodoList', 'list-1', 'Shopping', 'Groceries').request,
    });
    dataset().TodoItem![0]!.completed = true;
    bind(async () => rename('TodoItem', 'tea', 'buy tea', 'buy green tea'));
    expect(await submit('rename item buy tea to buy green tea')).toMatchObject({
      status: 'executed',
    });
    expect(dataset().TodoItem![0]).toMatchObject({ title: 'buy green tea', completed: true });
  });
  it('rejects invented rename values', async () => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', 'Groceries'));
    expect(await submit('rename list Shopping to Vacation')).toMatchObject({
      status: 'unresolved',
    });
    expect(dataset().TodoList![0]!.name).toBe('Shopping');

    bind(async () => rename('TodoItem', 'tea', 'buy tea', 'buy coffee'));
    expect(await submit('rename item buy tea to buy herbal tea')).toMatchObject({
      status: 'unresolved',
    });
    expect(dataset().TodoItem![0]!.title).toBe('buy tea');
  });
  it('allows rename capitalization differences from speech recognition', async () => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', 'Groceries'));
    expect(await submit('rename list Shopping to groceries')).toMatchObject({
      status: 'executed',
    });
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
  it.each(['', 'archive'])('keeps unsupported entity values unresolved: %s', async name => {
    bind(async () => rename('TodoList', 'list-1', 'Shopping', name));
    expect(await submit()).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList![0]!.name).toBe('Shopping');
  });
  it('keeps unexposed graph commands unresolved and without effects', async () => {
    const result = rename('TodoList', 'list-1', 'Shopping', 'Groceries');
    bind(async () => ({
      ...result,
      request: {
        ...result.request,
        command: { ...result.request.command, values: { color: '#f00' } },
      },
    }));
    expect(await submit()).toMatchObject({ status: 'unresolved' });
    expect(dataset().TodoList![0]!.name).toBe('Shopping');
  });
  it('rejects a graph command without its write precondition', async () => {
    const result = rename('TodoList', 'list-1', 'Shopping', 'Groceries');
    bind(async () => ({
      ...result,
      request: {
        ...result.request,
        command: { ...result.request.command, if: undefined },
      },
    }));
    await expect(submit()).rejects.toHaveProperty('code', 'model_output_invalid');
    expect(dataset().TodoList![0]!.name).toBe('Shopping');
  });
});
