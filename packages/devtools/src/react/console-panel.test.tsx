import { redo, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { isJsonValue, type JsonValue } from '@ontahi/core';
import {
  createEntityRef,
  createGraphClientCache,
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  defineClientDomainOperation,
  defineClientEntity,
  entity,
  field,
  graphSchema,
  withSelectionFactories,
  withContextualSelections,
} from '@ontahi/core/data-graph';
import type { TaskSnapshot } from '@ontahi/core/runtime/contracts';
import type { ExecutionIdentity } from '@ontahi/core/runtime/identity';
import {
  createRuntimeProtocolResponse,
  type RuntimeProtocolRequestEnvelope,
  type RuntimeProtocolResponseEnvelope,
} from '@ontahi/core/runtime/protocol';
import { consoleExpressionDialect } from '@ontahi/language-codemirror';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Effect } from 'effect';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConsolePanel } from './console-panel.js';

const originalRangeGetClientRects = Range.prototype.getClientRects;
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
});
afterAll(() => {
  if (originalRangeGetClientRects)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: originalRangeGetClientRects,
    });
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});
afterEach(cleanup);

// Match the mounted Devtools integration budget under parallel CI coverage.
const uiTestOptions = { timeout: 15_000 };

describe('Console actions', uiTestOptions, () => {
  const ListSchema = entity('List', { id: field.id(), name: field.string() });
  const List = defineClientEntity(ListSchema, {
    domainOperations: {
      createList: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        input: graphSchema.object({ name: field.string() }),
      }),
      reviewList: defineClientDomainOperation({
        authority: 'server',
        exposure: 'bridge',
        bridge: {},
        input: graphSchema.object({ name: field.string() }),
        durable: { runtime: 'in-process' },
      }),
    },
  });
  const ItemSchema = entity('Item', { id: field.id(), name: field.string() });
  const Item = defineClientEntity(ItemSchema);

  it('invokes a reflected Operation through its canonical Runtime Protocol family', async () => {
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'invocation-result',
        result: { ok: true, value: { created: 'Inbox' } },
      }),
    );
    render(
      <ConsolePanel
        options={{ entities: [List], initialDocument: 'List.createList({ name: "Inbox" })' }}
        runtimeTransport={{ request }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(request.mock.calls.some(([envelope]) => envelope.family === 'operation')).toBe(true),
    );
    const invocation = request.mock.calls.find(([envelope]) => envelope.family === 'operation')![0];
    expect(invocation).toMatchObject({
      family: 'operation',
      body: {
        version: 1,
        kind: 'invoke',
        operationId: 'List.createList',
        input: { name: 'Inbox' },
      },
    });
    expect(await within(screen.getByLabelText('Console result')).findByText('Inbox')).toBeDefined();
  });

  it('observes and answers durable Operation interactions through Runtime Protocol', async () => {
    const onActionExecuted = vi.fn();
    let continueChoice!: () => void;
    let continueApproval!: () => void;
    const choiceAnswered = new Promise<void>(resolve => {
      continueChoice = resolve;
    });
    const approvalAnswered = new Promise<void>(resolve => {
      continueApproval = resolve;
    });
    const run = { taskId: 'List.reviewList', runId: 'run-1' };
    const snapshot = (
      value: Pick<TaskSnapshot<JsonValue>, 'status'> & Partial<TaskSnapshot<JsonValue>>,
    ): TaskSnapshot<JsonValue> => ({
      taskId: run.taskId,
      runId: run.runId,
      updatedAt: '2026-09-28T20:00:00.000Z',
      ...value,
    });
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
      if (envelope.family === 'operation')
        return createRuntimeProtocolResponse(envelope, {
          kind: 'invocation-result',
          result: { ok: true, kind: 'success', value: { ...run, status: 'queued' } },
        });
      const body = envelope.body as {
        kind?: string;
        response?: { optionId?: string; decision?: string };
      };
      if (envelope.family === 'durable.operation' && body.kind === 'respond') {
        if (body.response?.optionId === 'list-2') continueChoice();
        if (body.response?.decision === 'approve') continueApproval();
        return createRuntimeProtocolResponse(envelope, {
          version: 1,
          kind: 'snapshot',
          snapshot: snapshot({ status: 'running' }),
        });
      }
      return createRuntimeProtocolResponse(envelope, {
        kind: 'protocol-error',
        error: { code: 'invalid_request', message: 'Unexpected request.' },
      });
    });
    const observe = async function* <TResult = JsonValue>() {
      yield snapshot({
        status: 'running',
        interaction: {
          id: 'choose-list',
          kind: 'choice',
          prompt: 'Which list?',
          options: [
            { id: 'list-1', label: 'Inbox' },
            { id: 'list-2', label: 'Later' },
          ],
          createdAt: '2026-09-28T20:00:00.000Z',
        },
      }) as TaskSnapshot<TResult>;
      await choiceAnswered;
      yield snapshot({
        status: 'running',
        interaction: {
          id: 'approve-list',
          kind: 'approval',
          prompt: 'Apply the proposal?',
          proposal: {
            id: 'proposal-1',
            summary: 'Update Later.',
            requests: [
              {
                version: 3,
                kind: 'graph-command',
                command: {
                  kind: 'entity-mutation-command',
                  action: 'delete',
                  entityName: 'List',
                  target: {
                    kind: 'selection',
                    entityName: 'List',
                    expression: {
                      kind: 'predicate',
                      fieldName: 'name',
                      operator: 'eq',
                      value: 'Later',
                    },
                  },
                },
              },
            ],
          },
          createdAt: '2026-09-28T20:00:01.000Z',
        },
      }) as TaskSnapshot<TResult>;
      await approvalAnswered;
      yield snapshot({ status: 'completed', result: { updated: 1 } }) as TaskSnapshot<TResult>;
    };
    render(
      <ConsolePanel
        options={{
          entities: [List],
          initialDocument: 'List.reviewList({ name: "Inbox" })',
          onActionExecuted,
        }}
        runtimeTransport={{ request, durableOperation: { observe } }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Observe' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start & observe' }));
    const result = within(screen.getByLabelText('Console result'));
    expect(await result.findByText('Which list?')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Observing…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onActionExecuted).not.toHaveBeenCalled();
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByRole('button', { name: 'Copy Durable Operation run JSON' })).toBeDefined();
    fireEvent.click(result.getByRole('button', { name: 'Visual' }));
    expect(result.getByText('Which list?')).toBeDefined();
    fireEvent.click(result.getByRole('button', { name: 'Later' }));
    expect(await result.findByText('Apply the proposal?')).toBeDefined();
    expect(result.getByText('Update Later.')).toBeDefined();
    expect(result.getByText('List.where(name eq "Later").delete()')).toBeDefined();
    expect(result.getByText('Exact requests')).toBeDefined();
    fireEvent.click(result.getByRole('button', { name: 'Approve' }));
    expect(await result.findByText('completed')).toBeDefined();
    expect(result.getByText('updated')).toBeDefined();
    expect(result.getByText('1')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Start & observe' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await waitFor(() => expect(onActionExecuted).toHaveBeenCalledOnce());
    expect(onActionExecuted).toHaveBeenCalledWith({
      execution: expect.objectContaining({ family: 'operation' }),
      response: expect.objectContaining({ ...run, status: 'completed', result: { updated: 1 } }),
    });

    const responses = request.mock.calls
      .map(([envelope]) => envelope)
      .filter(envelope => envelope.family === 'durable.operation');
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      body: {
        version: 1,
        kind: 'respond',
        run,
        response: { interactionId: 'choose-list', optionId: 'list-2' },
      },
    });
    expect(responses[1]).toMatchObject({
      body: {
        version: 1,
        kind: 'respond',
        run,
        response: { interactionId: 'approve-list', decision: 'approve' },
      },
    });
  });

  it('reports an unsuccessful Operation result without publishing action success', async () => {
    const onActionExecuted = vi.fn();
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'invocation-result',
        result: {
          ok: false,
          kind: 'rejected',
          executed: false,
          reason: 'duplicate',
          message: 'A list with that name already exists.',
        },
      }),
    );
    render(
      <ConsolePanel
        options={{
          entities: [List],
          initialDocument: 'List.createList({ name: "Inbox" })',
          onActionExecuted,
        }}
        runtimeTransport={{ request }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'A list with that name already exists.',
    );
    expect(onActionExecuted).not.toHaveBeenCalled();
  });

  it('executes an Entity update as a graph.command without read-only controls', async () => {
    const clientCache = createGraphClientCache();
    clientCache.writeEntity(ListSchema, { id: 'list-1', name: 'Inbox' });
    const onActionExecuted = vi.fn();
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
      if ((envelope.body as { kind?: string }).kind === 'graph-command-capabilities')
        return createRuntimeProtocolResponse(envelope, {
          kind: 'graph-command-capabilities-result',
          entityName: 'List',
          capabilities: { entityMutations: ['update'] },
        });
      return createRuntimeProtocolResponse(envelope, {
        kind: 'graph-command-result',
        value: {
          created: [],
          updated: [
            {
              entityName: 'List',
              ref: createEntityRef(ListSchema, { id: 'list-1' }),
              values: { id: 'list-1', name: 'Today' },
            },
          ],
          deleted: [],
        },
      });
    });
    render(
      <ConsolePanel
        clientCache={clientCache}
        options={{
          entities: [List],
          initialDocument: 'List.ref({ id: "list-1" }).update({ name: "Today" })',
          onActionExecuted,
        }}
        runtimeTransport={{ request }}
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([envelope]) =>
            envelope.family === 'graph.command' &&
            (envelope.body as { kind?: string }).kind === 'graph-command',
        ),
      ).toBe(true),
    );
    const command = request.mock.calls.find(
      ([envelope]) =>
        envelope.family === 'graph.command' &&
        (envelope.body as { kind?: string }).kind === 'graph-command',
    )![0];
    expect(command).toMatchObject({
      family: 'graph.command',
      body: {
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'List',
          target: { kind: 'entity-ref', entityName: 'List', locator: { id: 'list-1' } },
          values: { name: 'Today' },
        },
      },
    });
    expect(screen.queryByRole('button', { name: 'Observe' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Observe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await waitFor(() => expect(onActionExecuted).toHaveBeenCalledOnce());
    expect(clientCache.readEntity(createEntityRef(ListSchema, { id: 'list-1' }))).toEqual({
      id: 'list-1',
      name: 'Today',
    });
  });

  it('discovers and executes a Relationship Command authored in Console', async () => {
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
      if ((envelope.body as { kind?: string }).kind === 'graph-command-capabilities') {
        const entityName = (envelope.body as { entityName: string }).entityName;
        return createRuntimeProtocolResponse(envelope, {
          kind: 'graph-command-capabilities-result',
          entityName,
          capabilities: {
            entityMutations: [],
            relationshipCommandAffordances:
              entityName === 'List'
                ? [
                    {
                      kind: 'relationship-command-affordance',
                      relationKind: 'ordered',
                      relation: {
                        sourceEntityName: 'List',
                        relationName: 'items',
                        targetEntityName: 'Item',
                        cardinality: 'ordered-many',
                      },
                      actions: ['move'],
                      source: {
                        entityName: 'List',
                        locator: {
                          kind: 'object',
                          role: 'object',
                          unknownKeys: 'strict',
                          fields: { id: { kind: 'scalar', type: 'id' } },
                        },
                      },
                      member: {
                        entityName: 'Item',
                        locator: {
                          kind: 'object',
                          role: 'object',
                          unknownKeys: 'strict',
                          fields: { id: { kind: 'scalar', type: 'id' } },
                        },
                      },
                      placements: ['before', 'after', 'start', 'end'],
                      precondition: true,
                    },
                  ]
                : [],
          },
        });
      }
      return createRuntimeProtocolResponse(envelope, {
        kind: 'graph-command-result',
        value: { created: [], updated: [], deleted: [] },
      });
    });
    render(
      <ConsolePanel
        options={{
          entities: [List, Item],
          initialDocument: 'move List { id: "list-1" } items Item { id: "item-2" } at end',
        }}
        runtimeTransport={{ request }}
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([envelope]) =>
            envelope.family === 'graph.command' &&
            (envelope.body as { kind?: string }).kind === 'graph-command',
        ),
      ).toBe(true),
    );
    expect(
      request.mock.calls.find(
        ([envelope]) =>
          envelope.family === 'graph.command' &&
          (envelope.body as { kind?: string }).kind === 'graph-command',
      )![0],
    ).toMatchObject({
      family: 'graph.command',
      body: {
        version: 2,
        command: {
          kind: 'ordered-relationship-command',
          relation: { relationName: 'items' },
          source: { locator: { id: 'list-1' } },
          member: { locator: { id: 'item-2' } },
          position: { at: 'end' },
        },
      },
    });
  });

  it('executes a Selection update and reconciles every returned Entity', async () => {
    const clientCache = createGraphClientCache();
    clientCache.writeEntity(ListSchema, { id: 'list-1', name: 'Inbox' });
    clientCache.writeEntity(ListSchema, { id: 'list-2', name: 'Inbox' });
    const respond = async (
      envelope: RuntimeProtocolRequestEnvelope,
    ): Promise<RuntimeProtocolResponseEnvelope> => {
      const body =
        (envelope.body as { kind?: string }).kind === 'graph-command-capabilities'
          ? ({
              kind: 'graph-command-capabilities-result',
              entityName: 'List',
              capabilities: {
                entityMutations: ['update'],
                selectionMutations: ['update'],
              },
            } as const)
          : ({
              kind: 'graph-command-result',
              value: {
                created: [],
                updated: ['list-1', 'list-2'].map(id => ({
                  entityName: 'List',
                  ref: createEntityRef(ListSchema, { id }),
                  values: { id, name: 'Today' },
                })),
                deleted: [],
              },
            } as const);
      if (!isJsonValue(body)) throw new Error('Expected a portable Graph Command response.');
      return createRuntimeProtocolResponse(envelope, body);
    };
    const request = vi.fn(respond);
    render(
      <ConsolePanel
        clientCache={clientCache}
        options={{
          entities: [List],
          initialDialect: 'declarative',
          initialDocument: 'update List where { name = "Inbox" } with { name: "Today" }',
        }}
        runtimeTransport={{ request }}
      />,
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([envelope]) =>
            envelope.family === 'graph.command' &&
            (envelope.body as { kind?: string }).kind === 'graph-command',
        ),
      ).toBe(true),
    );
    const command = request.mock.calls.find(
      ([envelope]) =>
        envelope.family === 'graph.command' &&
        (envelope.body as { kind?: string }).kind === 'graph-command',
    )![0];
    expect(command).toMatchObject({
      family: 'graph.command',
      body: {
        version: 3,
        command: {
          action: 'update',
          target: {
            kind: 'selection',
            entityName: 'List',
            expression: { kind: 'predicate', fieldName: 'name', operator: 'eq', value: 'Inbox' },
          },
          values: { name: 'Today' },
        },
      },
    });
    await waitFor(() => {
      expect(clientCache.readEntity(createEntityRef(ListSchema, { id: 'list-1' }))).toEqual({
        id: 'list-1',
        name: 'Today',
      });
      expect(clientCache.readEntity(createEntityRef(ListSchema, { id: 'list-2' }))).toEqual({
        id: 'list-2',
        name: 'Today',
      });
    });
  });

  it('authors only Entity Commands advertised by the runtime policy', async () => {
    const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) =>
      createRuntimeProtocolResponse(envelope, {
        kind: 'graph-command-capabilities-result',
        entityName: 'List',
        capabilities: { entityMutations: ['update'] },
      }),
    );
    render(
      <ConsolePanel
        options={{
          entities: [List],
          initialDialect: 'declarative',
          initialDocument: 'delete List { id: "list-1" }',
        }}
        runtimeTransport={{ request }}
      />,
    );

    await screen.findByText('Entity Command List.delete is not available.');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);
    const commandMetadata = request.mock.calls.filter(
      ([envelope]) => envelope.family === 'graph.command',
    );
    expect(commandMetadata).toHaveLength(1);
    expect(commandMetadata[0]![0]).toMatchObject({
      family: 'graph.command',
      body: { version: 1, kind: 'graph-command-capabilities', entityName: 'List' },
    });
  });
});

describe('discovered variant Console roots', uiTestOptions, () => {
  it.each(['ts', 'declarative'] as const)(
    'discovers and executes a classified root in %s without a preliminary read',
    async initialDialect => {
      const Node = entity('ContentNode', {
        id: field.id(),
        type: field.enum(['part', 'chapter']),
        title: field.string(),
      });
      const Chapter = Node.variant('Chapter', { discriminator: { type: 'chapter' } });
      const runtime = createInMemoryDataGraphRuntime({
        entities: [Node],
        dataset: {
          ContentNode: [
            { id: 'p1', type: 'part', title: 'Part heading' },
            { id: 'c1', type: 'chapter', title: 'Intro' },
          ],
        },
      });
      const execute = vi.fn(query => Effect.runPromise(runtime.run(query, undefined)));
      const dispatch = createGraphReadDispatcher({
        policies: [
          {
            entity: Node,
            variants: [Chapter],
            scope: 'all',
            modes: ['run'],
            cardinalities: ['many'],
            maxLimit: 25,
            fields: {
              id: { select: true },
              type: { select: true, filter: ['eq'] },
              title: { select: true, order: true },
            },
          },
        ],
        execute,
      });
      const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
        const response = await dispatch(envelope.body, { authority: undefined });
        if (!isJsonValue(response)) throw new Error('Expected portable response');
        return createRuntimeProtocolResponse(envelope, response);
      });
      render(
        <ConsolePanel
          options={{ entities: [Node], initialDocument: 'Chap', initialDialect }}
          runtimeTransport={{ request }}
        />,
      );
      const view = EditorView.findFromDOM(
        screen.getByRole('textbox', { name: 'Ontahí Console expression' }),
      )!;
      await waitFor(() => expect(request).toHaveBeenCalled());
      await act(async () => {
        view.focus();
        fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
      });
      await screen.findByText('Variant of ContentNode');
      expect(execute).not.toHaveBeenCalled();
      const source = initialDialect === 'ts' ? 'Chapter.many()' : 'Chapter many';
      act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } }));
      await waitFor(() =>
        expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(
          false,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      const result = within(screen.getByLabelText('Console result'));
      await result.findByRole('table');
      expect(result.getByText('Intro')).toBeDefined();
      expect(result.queryByText('Part heading')).toBeNull();
      expect(execute.mock.calls[0]![0].root).toBe(Node);
      fireEvent.click(result.getByRole('button', { name: /Sort by title/ }));
      await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
      expect(view.state.doc.toString()).toContain(
        initialDialect === 'ts' ? '.orderBy(title' : 'order by title',
      );
    },
  );
});

const mountContextualConsole = (
  supported = true,
  initialDocument = 'List.openItems.where(completed = false).many()',
) => {
  const Item = entity('Item', {
    id: field.id(),
    listId: field.string(),
    title: field.string(),
    completed: field.boolean(),
  });
  const List = withContextualSelections(
    entity('List', { id: field.id() }).hasMany('items', Item, { via: 'listId' }),
    ({ self }) => ({
      openItems: self.items.where(item => item.completed.eq(false)),
    }),
  );
  const runtime = createInMemoryDataGraphRuntime({
    entities: [List, Item],
    dataset: {
      List: [{ id: 'l1' }],
      Item: [
        { id: 'i1', listId: 'l1', title: 'Open task', completed: false },
        { id: 'i2', listId: 'l1', title: 'Closed task', completed: true },
        { id: 'i3', listId: 'missing', title: 'Outside context', completed: false },
      ],
    },
  });
  const dispatch = createGraphReadDispatcher({
    ...(supported ? { relationSelections: true as const } : {}),
    policies: [
      {
        entity: List,
        scope: 'all',
        modes: ['run'],
        cardinalities: ['many'],
        maxLimit: 50,
        selectionRelations: ['items'],
        fields: { id: { filter: ['eq'] } },
      },
      {
        entity: Item,
        scope: 'all',
        modes: ['run'],
        cardinalities: ['many'],
        maxLimit: 50,
        fields: {
          id: { select: true },
          listId: { select: true },
          title: { select: true, order: true },
          completed: { select: true, filter: ['eq'] },
        },
      },
    ],
    execute: query => Effect.runPromise(runtime.run(query, undefined)),
  });
  const request = vi.fn(async (envelope: RuntimeProtocolRequestEnvelope) => {
    const body = await dispatch(envelope.body, { authority: undefined });
    if (!isJsonValue(body)) throw new Error('Expected portable response');
    return createRuntimeProtocolResponse(envelope, body);
  });
  render(
    <ConsolePanel
      options={{
        entities: [List, Item],
        initialDocument,
      }}
      runtimeTransport={{ request }}
    />,
  );
  const view = EditorView.findFromDOM(
    screen.getByRole('textbox', { name: 'Ontahí Console expression' }),
  )!;
  return { view, request, result: within(screen.getByLabelText('Console result')) };
};

describe('contextual Console execution', uiTestOptions, () => {
  it('executes source filters before navigation and retains them when switching dialects', async () => {
    const source = 'List.where(id = "l1").openItems.where(completed = false).many()';
    const { view, request, result } = mountContextualConsole(true, source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(result.getByText('Open task')).toBeDefined();
    expect(result.queryByText('Outside context')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    expect(view.state.doc.toString()).toBe(
      'List where id = "l1" through openItems where completed = false many',
    );
    const reads = () =>
      request.mock.calls
        .map(([envelope]) => envelope.body)
        .filter(body => (body as { kind: string }).kind === 'graph-read');
    expect(reads()).toHaveLength(1);
    fireEvent.click(result.getByRole('button', { name: /Sort by title/ }));
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(reads()[1]).toMatchObject({
      selection: (reads()[0] as { selection: unknown }).selection,
    });
    act(() =>
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: 'List where id = "missing" through openItems where completed = false many',
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(reads()).toHaveLength(3));
    await waitFor(() => expect(result.queryByText('Open task')).toBeNull());
  });

  it('negotiates v2, renders target controls, and preserves membership through dialect and table edits', async () => {
    const { view, request, result } = mountContextualConsole();
    expect(screen.getByRole('combobox', { name: 'Value for Item.completed' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(result.getByText('Open task')).toBeDefined();
    expect(result.queryByText('Closed task')).toBeNull();
    expect(result.queryByText('Outside context')).toBeNull();
    const reads = () =>
      request.mock.calls
        .map(([envelope]) => envelope.body)
        .filter(body => (body as { kind: string }).kind === 'graph-read');
    expect(reads()[0]).toMatchObject({ version: 2, selection: { entityName: 'Item' } });
    expect(request.mock.calls.map(([envelope]) => envelope.body)).toContainEqual({
      version: 1,
      kind: 'graph-read-capabilities',
      entityName: 'Item',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    expect(view.state.doc.toString()).toBe('List through openItems where completed = false many');
    await waitFor(() =>
      expect(result.getByRole('button', { name: /Sort by title/ }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.click(result.getByRole('button', { name: /Sort by title/ }));
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(view.state.doc.toString()).toContain(
      'through openItems where completed = false order by title',
    );
    expect(reads()[1]).toMatchObject({
      selection: (reads()[0] as { selection: unknown }).selection,
    });
    fireEvent.change(result.getByRole('spinbutton', { name: 'Result limit' }), {
      target: { value: '1' },
    });
    fireEvent.click(result.getByRole('button', { name: 'Apply limit' }));
    await waitFor(() => expect(reads()).toHaveLength(3));
    expect(reads()[2]).toMatchObject({
      limit: 1,
      selection: (reads()[0] as { selection: unknown }).selection,
    });
  });
  it('explains unsupported providers without sending a downgraded data read', async () => {
    const { request, result } = mountContextualConsole(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect((await result.findByRole('alert')).textContent).toContain(
      'does not support contextual Selections (v2)',
    );
    expect(
      request.mock.calls.every(
        ([envelope]) => (envelope.body as { kind: string }).kind === 'graph-read-capabilities',
      ),
    ).toBe(true);
  });
});

describe('Console dialect switching', uiTestOptions, () => {
  it('runs intersected factories and retains them through dialect and table ordering edits', async () => {
    const { view, request, result } = mountConsole(
      'Tag.by({ named: "Zulu" }).by({ identity: "t-z" }).where(active = true).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(result.getByText('Zulu')).toBeDefined();
    expect(result.queryByText('Alpha')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    expect(view.state.doc.toString()).toBe(
      'Tag by named "Zulu" and by identity "t-z" where active = true many',
    );
    expect(request).toHaveBeenCalledOnce();
    fireEvent.click(result.getByRole('button', { name: /Sort by name/ }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(view.state.doc.toString()).toContain(
      'by named "Zulu" and by identity "t-z" where active = true order by name',
    );
    expect(request.mock.calls[0]![0].body).toMatchObject({
      selection: Tag.by({ named: 'Zulu' })
        .and(Tag.by({ identity: 't-z' }))
        .and(t => t.active.eq(true))
        .toAst(),
    });
  });
  it('executes disjoint factory selections as an intersection, not an override or union', async () => {
    const { result } = mountConsole('Tag.by({ named: "Zulu" }).by({ identity: "t-a" }).count()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await result.findByText('0')).toBeDefined();
  });
  it('converts without executing and restores exact source plus parser on undo/redo', async () => {
    const source = '  Tag.where( active = true ).limit(2).many()  ';
    const { view, request, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    expect(view.state.doc.toString()).toBe('Tag where active = true limit 2 many');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(screen.getByRole('button', { name: 'Declarative' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(request).toHaveBeenCalledOnce();
    expect(result.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('combobox', { name: 'Value for Tag.active' })).toBeDefined();
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe(source);
    expect(view.state.field(consoleExpressionDialect)).toBe('ts');
    expect(screen.getByRole('button', { name: 'TS' }).getAttribute('aria-pressed')).toBe('true');
    act(() => {
      redo(view);
    });
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(request).toHaveBeenCalledOnce();
  });

  it('runs declarative source with rich values and receiver-backed sort/limit edits', async () => {
    const { view, request, result, visibleNames, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    fireEvent.click(result.getByRole('button', { name: /Sort by name/ }));
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 2 many');
    applyLimit(1);
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha']));
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 1 many');
    expect(request).toHaveBeenCalledTimes(3);
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe('Tag where active = true order by name limit 2 many');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
    fireEvent.change(screen.getByRole('combobox', { name: 'Value for Tag.active' }), {
      target: { value: 'false' },
    });
    expect(view.state.doc.toString()).toContain('active = false');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('keeps invalid drafts untouched and allows switching an empty editor', () => {
    const { view, replaceSource, request } = mountConsole('Tag.where(active =');
    const button = screen.getByRole('button', { name: 'Declarative' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Fix the expression');
    fireEvent.click(button);
    expect(view.state.doc.toString()).toBe('Tag.where(active =');
    replaceSource('   ');
    fireEvent.click(button);
    expect(view.state.doc.toString()).toBe('   ');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    act(() => {
      undo(view);
    });
    expect(view.state.field(consoleExpressionDialect)).toBe('ts');
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves pending exists intent when switching dialect and editing the new draft', async () => {
    const { request, respond, replaceSource, result, view } = mountConsole('Tag.exists()');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    replaceSource('Tag first');
    await act(async () => {
      release();
      await pending;
    });
    await result.findByText('true');
    expect(view.state.doc.toString()).toBe('Tag first');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
    expect(request).toHaveBeenCalledOnce();
  });

  it('supports an initial declarative dialect without requiring an initial document', () => {
    render(<ConsolePanel options={{ entities: [Tag], initialDialect: 'declarative' }} />);
    const view = EditorView.findFromDOM(
      screen.getByRole('textbox', { name: 'Ontahí Console expression' }),
    )!;
    expect(view.state.doc.toString()).toBe('Tag');
    expect(view.state.field(consoleExpressionDialect)).toBe('declarative');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

const Tag = withSelectionFactories(
  entity('Tag', { id: field.id(), name: field.string(), active: field.boolean() }),
  {
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    named: {
      version: 1,
      input: graphSchema.object({ text: field.string() }),
      scalarInput: 'text',
      template: { kind: 'predicate', fieldName: 'name', operator: 'eq', input: 'text' },
    },
  },
);
const Other = entity('Other', { id: field.id(), name: field.string() });
const rows = [
  { id: 't-z', name: 'Zulu', active: true },
  { id: 't-m', name: 'Middle', active: true },
  { id: 't-a', name: 'Alpha', active: true },
  { id: 't-hidden', name: 'A hidden', active: false },
];

const mountConsole = (
  source = 'Tag.where(active = true).limit(2).many()',
  metadataResponse?: JsonValue,
) => {
  const runtime = createInMemoryDataGraphRuntime({ dataset: { Tag: rows }, entities: [Tag] });
  const dispatch = createGraphReadDispatcher({
    policies: [
      {
        entity: Tag,
        modes: ['run', 'get', 'count'],
        cardinalities: ['many', 'one'],
        maxLimit: 50,
        scope: 'all',
        fields: {
          id: { select: true, filter: ['eq'] },
          name: { select: true, filter: ['eq'], order: true },
          active: { select: true, filter: ['eq'] },
        },
      },
    ],
    execute: (query, mode) =>
      Effect.runPromise(
        mode === 'run'
          ? runtime.run(query, undefined)
          : mode === 'get'
            ? runtime.get(query, undefined)
            : runtime.count(query, undefined),
      ),
  });
  const respond = async (
    envelope: RuntimeProtocolRequestEnvelope,
  ): Promise<RuntimeProtocolResponseEnvelope> => {
    const body = await dispatch(envelope.body, { authority: undefined });
    if (!isJsonValue(body)) throw new Error('Expected a portable Graph Read response.');
    return createRuntimeProtocolResponse(envelope, body);
  };
  const request = vi.fn(respond);
  const metadata = vi.fn((envelope: RuntimeProtocolRequestEnvelope) =>
    metadataResponse === undefined
      ? respond(envelope)
      : Promise.resolve(createRuntimeProtocolResponse(envelope, metadataResponse)),
  );
  const route = (dataRequest: typeof request) => (envelope: RuntimeProtocolRequestEnvelope) =>
    (envelope.body as { kind?: string }).kind === 'graph-read-capabilities'
      ? metadata(envelope)
      : dataRequest(envelope);
  const transport = { request: route(request) };
  const rendered = render(
    <ConsolePanel
      options={{ entities: [Tag, Other], initialDocument: source }}
      runtimeTransport={transport}
    />,
  );
  const editor = screen.getByRole('textbox', { name: 'Ontahí Console expression' });
  const view = EditorView.findFromDOM(editor)!;
  const replaceSource = (next: string) =>
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    });
  const result = within(screen.getByLabelText('Console result'));
  const visibleNames = () =>
    result
      .getAllByRole('row')
      .slice(1)
      .map(row => within(row).getAllByRole('cell')[1]!.textContent);
  const switchTransport = () => {
    const nextRequest = vi.fn(respond);
    rendered.rerender(
      <ConsolePanel
        options={{ entities: [Tag, Other], initialDocument: source }}
        runtimeTransport={{ request: route(nextRequest) }}
      />,
    );
    return nextRequest;
  };
  const applyLimit = (limit: number | string) => {
    fireEvent.change(result.getByRole('spinbutton', { name: 'Result limit' }), {
      target: { value: String(limit) },
    });
    fireEvent.submit(result.getByRole('form', { name: 'Query limit' }));
  };
  return {
    request,
    metadata,
    respond,
    view,
    replaceSource,
    result,
    visibleNames,
    switchTransport,
    setIdentity: (identity: ExecutionIdentity) =>
      rendered.rerender(
        <ConsolePanel
          options={{ entities: [Tag, Other], initialDocument: source, identity }}
          runtimeTransport={transport}
        />,
      ),
    applyLimit,
  };
};

describe('Console exists reads', uiTestOptions, () => {
  it.each([
    ['Tag.exists()', true],
    ['Tag.where(active = true).exists()', true],
    ['Tag.where(name = "Missing").exists()', false],
    ['Tag.where(none).exists()', false],
  ])('renders %s as a Boolean in Visual and JSON', async (source, expected) => {
    const { request, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText(String(expected));
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].body).toMatchObject({ mode: 'get', limit: 1, orderBy: [] });
    expect(request.mock.calls[0]![0].body).not.toHaveProperty('cardinality');
    expect(result.queryByRole('table')).toBeNull();
    expect(result.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByText(String(expected)).closest('pre')?.textContent).toBe(String(expected));
  });

  it('keeps the executed exists intent when the editor changes during the read', async () => {
    const { request, respond, replaceSource, result } = mountConsole('Tag.exists()');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    replaceSource('Tag.first()');
    await act(async () => {
      release();
      await pending;
    });
    await result.findByText('true');
    expect(result.getByRole('status').textContent).toBe('Changes not run');
  });

  it('preserves policy and transport failures instead of turning them into false', async () => {
    const { request, replaceSource, result } = mountConsole('Tag.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText('true');
    replaceSource('Other.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect((await result.findByRole('alert')).textContent).toBe('Data graph read access denied.');
    expect(result.getByText('true')).toBeTruthy();
    request.mockRejectedValueOnce(new Error('Connection lost'));
    replaceSource('Tag.exists()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(result.getByText('true')).toBeTruthy();
  });

  it.each([[[]], [false], [0], ['invalid']])(
    'rejects a malformed nullable get result %j',
    async value => {
      const { request, result } = mountConsole('Tag.exists()');
      request.mockImplementationOnce(async envelope =>
        createRuntimeProtocolResponse(envelope, {
          version: 1,
          kind: 'graph-read-result',
          value,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      expect((await result.findByRole('alert')).textContent).toBe(
        'Graph Read exists expected an Entity record or null.',
      );
      expect(result.queryByText('true')).toBeNull();
      expect(result.queryByText('false')).toBeNull();
    },
  );
});

describe('Console bidirectional Query limit', uiTestOptions, () => {
  it('keeps result chrome in one toolbar without repeating the query or success status', async () => {
    const { result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const toolbar = within(result.getByRole('group', { name: 'Console result toolbar' }));
    expect(toolbar.getByRole('spinbutton', { name: 'Result limit' })).toBeTruthy();
    expect(toolbar.getByRole('button', { name: 'JSON' })).toBeTruthy();
    expect(toolbar.getByLabelText('Last query duration').textContent).toMatch(/^\d+ ms$/);
    expect(result.queryByText('Executed query')).toBeNull();
    expect(result.queryByText('Result matches the executed query.')).toBeNull();
    expect(result.queryByText('success')).toBeNull();
    expect(result.queryByText(/returned rows · executed limit/)).toBeNull();
    expect(toolbar.queryByRole('button', { name: 'Apply limit' })).toBeNull();
    fireEvent.click(toolbar.getByRole('button', { name: 'JSON' }));
    expect(toolbar.getByRole('spinbutton')).toBeTruthy();
  });

  it('resets an unapplied toolbar limit when rerunning the source', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, desc) .many()';
    const { request, view, result } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '25');
    expect(result.getAllByRole('row')).toHaveLength(4);
    fireEvent.change(result.getByRole('spinbutton'), { target: { value: '7' } });
    expect(request).toHaveBeenCalledOnce();
    expect(view.state.doc.toString()).toBe(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '25'));
    expect(request).toHaveBeenCalledTimes(2);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('edits the current draft limit, preserving filters, order and undo history', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, desc) .many()';
    const { request, view, replaceSource, result, visibleNames, applyLimit } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    request.mockClear();
    const draft = source.replace('desc', 'asc');
    replaceSource(draft);
    applyLimit(2);
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    const edited = draft.replace(') .many()', ').limit(2) .many()');
    expect(view.state.doc.toString()).toBe(edited);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty('value', '2');
    expect(request.mock.calls[0]![0].body).toMatchObject({
      limit: 2,
      orderBy: [{ fieldName: 'name', direction: 'asc' }],
    });
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(draft);
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getAllByRole('row')).toHaveLength(3);
    expect(request).toHaveBeenCalledOnce();
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(edited);
  });

  it('applies a zero limit to the source and renders an empty result', async () => {
    const source = '  Tag.where(active = true) .orderBy(name, asc).limit(2) .many()';
    const { view, result, applyLimit } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    applyLimit(0);
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '0'));
    expect(view.state.doc.toString()).toBe(source.replace('limit(2)', 'limit(0)'));
    expect(result.getByText('Empty list')).toBeTruthy();
  });

  it('rejects invalid toolbar limit values without executing a read', async () => {
    const { request, result, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    for (const value of ['', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) applyLimit(value);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    'Tag.limit(',
    'Other.many()',
    'Tag.first()',
    'Tag.one()',
    'Tag.count()',
    'Tag.exists()',
  ])('disables toolbar limit edits for the unsafe draft %s', async source => {
    const { request, replaceSource, result, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    replaceSource(source);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty(
      'disabled',
      true,
    );
    applyLimit(3);
    expect(request).toHaveBeenCalledOnce();
  });

  it('reflects source limits only after Run and removes the control for scalar results', async () => {
    const { replaceSource, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    replaceSource('Tag.limit(3).many()');
    expect(result.getByRole('spinbutton').getAttribute('title')).toContain('Executed limit: 2.');
    expect(result.getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '3'));
    expect(result.getAllByRole('row')).toHaveLength(4);
    expect(result.getByRole('spinbutton', { name: 'Result limit' })).toHaveProperty('value', '3');
    replaceSource('Tag.count()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.queryByRole('spinbutton')).toBeNull());
  });

  it('retains executed results and limit on policy or transport failure', async () => {
    const { request, view, result, visibleNames, applyLimit } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const duration = result.getByLabelText('Last query duration').textContent;
    applyLimit(51);
    await result.findByRole('alert');
    expect(result.getByLabelText('Last query duration').textContent).toBe(duration);
    expect(view.state.doc.toString()).toBe('Tag.where(active = true).limit(51).many()');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    request.mockRejectedValueOnce(new Error('Connection lost'));
    applyLimit(1);
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    applyLimit(3);
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '3'));
    expect(result.getAllByRole('row')).toHaveLength(4);
  });

  it('keeps pending limits truthful, preserves newer editor changes and requires current transport', async () => {
    const { request, respond, view, replaceSource, result, applyLimit, switchTransport } =
      mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    applyLimit(1);
    expect(result.getByRole('spinbutton')).toHaveProperty('value', '2');
    expect(result.getAllByRole('row')).toHaveLength(3);
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', true);
    applyLimit(3);
    expect(request).toHaveBeenCalledTimes(2);
    replaceSource('Tag.where(active = false).many()');
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '1'));
    expect(result.getAllByRole('row')).toHaveLength(2);
    expect(view.state.doc.toString()).toBe('Tag.where(active = false).many()');
    switchTransport();
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('spinbutton')).toHaveProperty('value', '25'));
    expect(result.getAllByRole('row')).toHaveLength(2);
    expect(result.getByRole('spinbutton')).toHaveProperty('disabled', false);
  });
});

describe('Console bidirectional Query ordering', uiTestOptions, () => {
  it.each([
    { principal: { kind: 'user' as const, subject: 'alice' } },
    { principal: null, cacheScope: { tenant: 'other', policyRevision: 2 } },
  ])(
    'drops previous authority results and ordering choices without discarding the draft: %j',
    async identity => {
      const { view, request, metadata, result, setIdentity } = mountConsole(
        'Tag.orderBy(name).many()',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      expect(
        result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
      ).toBe('false');
      let reply!: () => void;
      metadata.mockImplementationOnce(
        envelope =>
          new Promise(resolve => {
            reply = () =>
              resolve(
                createRuntimeProtocolResponse(envelope, {
                  kind: 'graph-read-capabilities-result',
                  entityName: 'Tag',
                  capabilities: { orderBy: ['id'] },
                }),
              );
          }),
      );
      setIdentity(identity);
      expect(result.queryByRole('table')).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Order field for Tag' })).toBeNull();
      expect(screen.getByText('Loading ordering permissions…')).toBeTruthy();
      expect(EditorView.findFromDOM(screen.getByRole('textbox'))).toBe(view);
      expect(view.state.doc.toString()).toBe('Tag.orderBy(name).many()');
      await act(async () => reply());
      expect(request).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      expect(
        result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
      ).toBe('true');
      expect(result.getByRole('button', { name: 'Sort by id' }).getAttribute('aria-disabled')).toBe(
        'false',
      );
      const calls = metadata.mock.calls.length;
      setIdentity({ ...identity });
      expect(metadata).toHaveBeenCalledTimes(calls);
      expect(result.getByRole('table')).toBeTruthy();
    },
  );

  it.each(['success', 'error'])(
    'ignores a late data %s after switching authority, including switching back',
    async outcome => {
      const { request, respond, result, setIdentity } = mountConsole();
      let reply!: () => void;
      request.mockImplementationOnce(
        envelope =>
          new Promise((resolve, reject) => {
            reply = () =>
              outcome === 'success'
                ? resolve(respond(envelope))
                : reject(new Error('Old session error'));
          }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      setIdentity({ principal: { kind: 'user', subject: 'alice' } });
      setIdentity({ principal: null });
      await act(async () => reply());
      expect(result.queryByRole('table')).toBeNull();
      expect(result.queryByRole('alert')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      expect(request).toHaveBeenCalledTimes(2);
    },
  );

  it('loads ordering permissions before the first query', async () => {
    const { request } = mountConsole('Tag.orderBy(');
    expect(screen.getByText('Loading ordering permissions…')).toBeTruthy();
    const field = await screen.findByRole('combobox', { name: 'Order field for Tag' });
    expect(
      within(field)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['Choose field', 'name']);
    expect(request).not.toHaveBeenCalled();
  });

  it('offers permitted declarative ordering Fields without reading any rows', async () => {
    const { request, view, replaceSource, metadata } = mountConsole('Tag.many()');
    fireEvent.click(screen.getByRole('button', { name: 'Declarative' }));
    replaceSource('Tag order by ');
    await screen.findByRole('combobox', { name: 'Order field for Tag' });
    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    });
    fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
    const completions = within(await screen.findByRole('listbox'));
    expect(completions.getAllByRole('option').map(option => option.textContent)).toEqual([
      'namestring',
    ]);
    expect(request).not.toHaveBeenCalled();
    expect(metadata.mock.calls.map(([envelope]) => envelope.body)).toEqual([
      { version: 1, kind: 'graph-read-capabilities', entityName: 'Tag' },
      { version: 1, kind: 'graph-read-capabilities', entityName: 'Other' },
    ]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Order field for Tag' }), {
      target: { value: 'name' },
    });
    expect(view.state.doc.toString()).toBe('Tag order by name');
    fireEvent.change(screen.getByRole('combobox', { name: 'Order direction for Tag' }), {
      target: { value: ' descending' },
    });
    expect(view.state.doc.toString()).toBe('Tag order by name descending');
    expect(request).not.toHaveBeenCalled();
  });

  it('uses receiver ordering permissions in autocomplete, without restricting manual source', async () => {
    const { view, replaceSource, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const source = 'Tag.where(active = true).orderBy().many()';
    replaceSource(source);
    act(() => {
      view.dispatch({ selection: { anchor: source.indexOf('orderBy(') + 'orderBy('.length } });
      view.focus();
    });
    fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
    const completions = within(await screen.findByRole('listbox'));
    expect(completions.getAllByRole('option').map(option => option.textContent)).toEqual([
      'namestring',
    ]);
    replaceSource('Tag.orderBy(id).many()');
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await result.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
  });

  it('enables only ordering Fields advertised by the receiver', async () => {
    const { request, view, result } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const id = result.getByRole('button', { name: 'Sort by id' });
    expect(id.getAttribute('aria-disabled')).toBe('true');
    expect(id.getAttribute('title')).toBe(
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
    expect(
      result.getByRole('button', { name: 'Sort by active' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'false',
    );
    const source = view.state.doc.toString();
    fireEvent.click(id);
    fireEvent.keyDown(id, { key: 'Enter' });
    id.focus();
    expect(document.activeElement).toBe(id);
    expect(view.state.doc.toString()).toBe(source);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0].body).toHaveProperty('includeCapabilities', true);
  });

  it.each(['transport', 'entity', 'authority'] as const)(
    'drops open ordering suggestions when the %s changes',
    async change => {
      const { view, replaceSource, result, switchTransport, setIdentity, metadata } =
        mountConsole();
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      const source = 'Tag.orderBy().many()';
      replaceSource(source);
      act(() => {
        view.dispatch({ selection: { anchor: source.indexOf('(') + 1 } });
        view.focus();
      });
      fireEvent.keyDown(view.contentDOM, { key: ' ', code: 'Space', ctrlKey: true });
      const completions = within(await screen.findByRole('listbox'));
      expect(completions.getAllByRole('option').map(option => option.textContent)).toEqual([
        'namestring',
      ]);
      if (change !== 'entity') {
        metadata.mockImplementationOnce(async envelope =>
          createRuntimeProtocolResponse(envelope, {
            kind: 'graph-read-capabilities-result',
            entityName: 'Tag',
            capabilities: { orderBy: [] },
          }),
        );
        if (change === 'transport') switchTransport();
        else setIdentity({ principal: null, cacheScope: 'restricted' });
      } else act(() => view.dispatch({ changes: { from: 0, to: 3, insert: 'Other' } }));
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull(), { timeout: 5_000 });
      expect(view.state.doc.toString()).toBe(
        change === 'entity' ? 'Other.orderBy().many()' : source,
      );
    },
  );

  it('edits the source and executes server ordering before the limit, with an undoable sort cycle', async () => {
    const source = '  Tag.where(active = true)\n .limit(2).many()';
    const { request, view, result, visibleNames } = mountConsole(source);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    act(() => view.dispatch({ selection: { anchor: source.indexOf('active') } }));
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    const ascSource = '  Tag.where(active = true).orderBy(name)\n .limit(2).many()';
    expect(view.state.doc.toString()).toBe(ascSource);
    expect(view.state.selection.main.head).toBe(source.indexOf('active'));
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0].body).toMatchObject({
      orderBy: [{ fieldName: 'name', direction: 'asc' }],
      limit: 2,
      selection: {
        expression: { kind: 'predicate', fieldName: 'active', operator: 'eq', value: true },
      },
    });

    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(source);
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(2);
    expect(visibleNames()).toEqual(['Alpha', 'Middle']);
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(ascSource);
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(visibleNames()).toEqual(['Zulu', 'Middle']));
    expect(view.state.doc.toString()).toBe(
      ascSource.replace('orderBy(name)', 'orderBy(name, desc)'),
    );
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.getByRole('status').textContent).toBe(''));
    expect(view.state.doc.toString()).toBe(source);
    expect(result.getByRole('columnheader', { name: 'name' }).hasAttribute('aria-sort')).toBe(
      false,
    );
  });

  it('reflects textual ordering only after Run and disables controls for unsafe drafts', async () => {
    const { request, view, replaceSource, result, visibleNames } = mountConsole(
      'Tag.orderBy(name, desc).limit(2).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    replaceSource('Tag.orderBy(name).limit(2).many()');
    expect(request).toHaveBeenCalledOnce();
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    for (const draft of ['Tag.orderBy(', 'Other.many()', 'Tag.first()', 'Tag.count()']) {
      replaceSource(draft);
      const sort = result.getByRole('button', { name: 'Sort by name' }) as HTMLButtonElement;
      expect(sort.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(sort);
      expect(view.state.doc.toString()).toBe(draft);
      expect(request).toHaveBeenCalledOnce();
    }
    replaceSource('Tag.orderBy(name).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(visibleNames()).toEqual(['A hidden', 'Alpha']));
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('keeps the last executed snapshot during a pending request, without overwriting newer edits', async () => {
    const { request, respond, view, replaceSource, result, visibleNames } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    request.mockImplementationOnce(async envelope => {
      await pending;
      return respond(envelope);
    });
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    expect(visibleNames()).toEqual(['Zulu', 'Middle']);
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    replaceSource('Tag.where(active = false).many()');
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(visibleNames()).toEqual(['Alpha', 'Middle']));
    expect(view.state.doc.toString()).toBe('Tag.where(active = false).many()');
    expect(result.getByText(/Changes not run/)).toBeTruthy();
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(result.getByRole('status').textContent).toBe('Changes not run');
  });

  it('preserves results and executed ordering when policy or transport rejects a new sort', async () => {
    const { request, view, replaceSource, result, visibleNames, metadata } = mountConsole(
      'Tag.orderBy(name).limit(2).many()',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    metadata.mockRejectedValueOnce(new Error('Permissions service unavailable'));
    replaceSource('Tag.orderBy(id).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await result.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ordering by Tag.id is not allowed by the Graph Read policy.',
    );
    expect(view.state.doc.toString()).toBe('Tag.orderBy(id).limit(2).many()');
    expect(visibleNames()).toEqual(['A hidden', 'Alpha']);
    expect(result.getByRole('columnheader', { name: 'name' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    request.mockRejectedValueOnce(new Error('Connection lost'));
    expect(result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    replaceSource('Tag.orderBy(name).limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(result.getByRole('alert').textContent).toBe('Connection lost'));
    expect(visibleNames()).toEqual(['A hidden', 'Alpha']);
    expect(request).toHaveBeenCalledTimes(3);
    fireEvent.click(result.getByRole('button', { name: 'JSON' }));
    expect(result.getByText('"A hidden"')).toBeTruthy();
  });

  it.each([undefined, null, {}, { orderBy: [1] }])(
    'keeps results but disables sorting when capability metadata is unavailable: %j',
    async capabilities => {
      const body = {
        kind: 'graph-read-capabilities-result',
        entityName: 'Tag',
        ...(capabilities === undefined ? {} : { capabilities }),
      };
      if (!isJsonValue(body)) throw new Error('Expected portable test metadata.');
      const { request, view, result, metadata, respond } = mountConsole(
        'Tag.orderBy(name).many()',
        body,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await result.findByRole('table');
      const name = result.getByRole('button', { name: 'Sort by name' });
      expect(name.getAttribute('aria-disabled')).toBe('true');
      expect(name.getAttribute('title')).toContain('Ordering permissions unavailable');
      const source = view.state.doc.toString();
      fireEvent.click(name);
      expect(view.state.doc.toString()).toBe(source);
      expect(request).toHaveBeenCalledOnce();
      metadata.mockImplementationOnce(respond);
      fireEvent.click(screen.getByRole('button', { name: 'Retry ordering permissions' }));
      await waitFor(() =>
        expect(
          result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
        ).toBe('false'),
      );
    },
  );

  it('does not reuse capability metadata after replacing the transport', async () => {
    const { request, result, switchTransport } = mountConsole();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByRole('table');
    const nextRequest = switchTransport();
    const name = result.getByRole('button', { name: 'Sort by name' });
    expect(name.getAttribute('aria-disabled')).toBe('true');
    expect(name.getAttribute('title')).toContain('for this transport');
    fireEvent.click(name);
    expect(request).toHaveBeenCalledOnce();
    expect(nextRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(
        result.getByRole('button', { name: 'Sort by name' }).getAttribute('aria-disabled'),
      ).toBe('false'),
    );
    expect(nextRequest).toHaveBeenCalledOnce();
  });

  it('keeps sortable reflected headers when a valid query returns no rows', async () => {
    const { view, result, request } = mountConsole('Tag.where(name = "Missing").limit(2).many()');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await result.findByText('Empty list');
    fireEvent.click(result.getByRole('button', { name: 'Sort by name' }));
    await waitFor(() => expect(result.getByRole('status').textContent).toBe(''));
    expect(view.state.doc.toString()).toBe(
      'Tag.where(name = "Missing").orderBy(name).limit(2).many()',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
