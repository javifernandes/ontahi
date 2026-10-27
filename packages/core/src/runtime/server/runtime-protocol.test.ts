import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  field,
  value,
  type GraphReadDispatchContext,
  type GraphReadObservationResponse,
} from '../../data-graph/index.js';
import {
  createRuntimeProtocolRequest,
  RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
  toOperationProtocolRequest,
} from '../protocol/index.js';

import type { EventDelivery } from './events/index.js';
import {
  getCurrentInvocationContext,
  withInvocationContext as runWithInvocationContext,
} from './invocation-context.js';
import { recordModelResourceUsage } from './resource-evidence.js';
import {
  createApplicationRuntimeProtocol,
  type ApplicationRuntimeProtocolOptions,
} from './runtime-protocol.js';
import {
  COMMITTED_MUTATION_DELIVERY_RESOURCE_KEY,
  declareSelectionChange,
} from './unit-of-work.js';

type Context = { principal: { kind: 'user'; subject: string } | null };
type Application = ApplicationRuntimeProtocolOptions<Context>['application'];

const run = { taskId: 'Todo.review', runId: 'run-1' } as const;
const snapshot = {
  ...run,
  status: 'running' as const,
  updatedAt: '2026-10-03T00:00:00.000Z',
};

const request = (family: string, body: unknown) =>
  createRuntimeProtocolRequest({ id: `${family}-1`, family, body });

const createApplication = () => {
  const observedPrincipals: unknown[] = [];
  const respondToTaskInteraction = vi.fn(async () => snapshot);
  const withInvocationContext = vi.fn(<T>(context: Context, effect: () => T) =>
    runWithInvocationContext(context, effect),
  );
  const application = {
    resolveOperation: () => undefined,
    invokeOperation: vi.fn(),
    checkPermission: vi.fn(),
    getTaskSnapshot: vi.fn(async () => snapshot),
    respondToTaskInteraction,
    createGraphReadDispatcher: vi.fn(() => async () => {
      observedPrincipals.push(getCurrentInvocationContext()?.principal);
      return { version: 1, kind: 'graph-read-result', value: [] };
    }),
    createGraphReadObserver: vi.fn(
      () =>
        async function* () {
          observedPrincipals.push(getCurrentInvocationContext()?.principal);
        },
    ),
    createGraphCommandDispatcher: vi.fn(() => async (request: { kind: string }) => {
      observedPrincipals.push(getCurrentInvocationContext()?.principal);
      if (request.kind === 'graph-command') {
        declareSelectionChange({
          kind: 'selection',
          entityName: 'Todo',
          expression: { kind: 'all' },
        });
      }
      return {
        version: 1,
        kind: 'graph-command-result',
        value: { status: 'applied', delta: { added: [], removed: [], moved: [] } },
      };
    }),
    app: {
      runtime: { withInvocationContext },
      task: { observe: () => Stream.empty },
    },
  } as unknown as Application;

  return { application, observedPrincipals, respondToTaskInteraction, withInvocationContext };
};

describe('application Runtime Protocol', () => {
  it('composes application families and preserves the configured policies', async () => {
    const { application, observedPrincipals, withInvocationContext } = createApplication();
    const graphReadPolicies = [
      {
        entity: { name: 'Todo' },
        fields: {},
        modes: ['run'],
        cardinalities: ['many'],
        maxLimit: 25,
        scope: 'all',
      },
    ] as never;
    const graphCommandPolicies = [
      { entity: { name: 'Todo' }, fieldName: 'owner', actions: ['link'] },
    ] as never;
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [...graphReadPolicies, ...graphCommandPolicies],
    });
    const context: Context = { principal: { kind: 'user', subject: 'user-1' } };

    await expect(
      protocol.dispatcher(
        request(
          'operation',
          toOperationProtocolRequest({ kind: 'invoke', operationId: 'Todo.missing', input: {} }),
        ),
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'response',
      family: 'operation',
      body: { kind: 'invocation-result', result: { kind: 'rejected' } },
    });
    await expect(
      protocol.dispatcher(
        request('durable.operation', toDurableOperationProtocolRequest(run)),
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'snapshot', snapshot },
    });
    await expect(
      protocol.dispatcher(
        request('graph.read', {
          version: 1,
          kind: 'graph-read-capabilities',
          entityName: 'Todo',
        }),
        context,
      ),
    ).resolves.toMatchObject({ kind: 'response', family: 'graph.read' });
    await expect(
      protocol.dispatcher(
        request('graph.command', {
          version: 1,
          kind: 'graph-command-capabilities',
          entityName: 'Todo',
        }),
        context,
      ),
    ).resolves.toMatchObject({ kind: 'response', family: 'graph.command' });

    for await (const _snapshot of protocol.observeGraph({} as never, {
      context,
      signal: new AbortController().signal,
    })) {
      // Empty observer; iteration proves the receiver delegates lazily.
    }
    for await (const _snapshot of protocol.observeDurableOperation(run, {
      context,
      signal: new AbortController().signal,
    })) {
      // Empty observer; iteration proves the receiver restores invocation context.
    }

    expect(protocol.graphReadPolicies).toEqual(graphReadPolicies);
    expect(protocol.graphCommandPolicies).toEqual(graphCommandPolicies);
    expect(withInvocationContext).toHaveBeenCalled();
    expect(observedPrincipals).toEqual([context.principal, context.principal, context.principal]);
  });

  it('denies anonymous interaction responses and derives authenticated actors by default', async () => {
    const { application, respondToTaskInteraction } = createApplication();
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
    });
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'approve',
      decision: 'approve',
    });

    await expect(
      protocol.dispatcher(request('durable.operation', body), { principal: null }),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'protocol-error', error: { code: 'access_denied' } },
    });
    await protocol.dispatcher(request('durable.operation', body), {
      principal: { kind: 'user', subject: 'user-1' },
    });

    expect(respondToTaskInteraction).toHaveBeenCalledWith(run, body.response, {
      actor: { kind: 'user', id: 'user-1' },
    });
  });

  it('projects model usage according to host disclosure without returning raw accounting data', async () => {
    const { application } = createApplication();
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      modelCommand: {
        runtime: {
          submit: vi.fn(async () => {
            recordModelResourceUsage({
              provider: 'anthropic',
              model: 'claude-test',
              totalTokens: 6,
              durationMs: 20,
            });
            return {
              status: 'answered' as const,
              message: 'Try buying milk.',
              resourceUsage: [
                {
                  provider: 'openai',
                  model: 'gpt-test',
                  totalTokens: 24,
                  durationMs: 180,
                },
              ],
            };
          }),
        },
      },
    });

    const response = await protocol.dispatcher(
      request('model.command', { version: 1, kind: 'model-command', text: 'suggest an item' }),
      { principal: null, resourceEvidenceDisclosure: 'summary' } as Context,
    );

    expect(response).toMatchObject({
      kind: 'response',
      body: {
        kind: 'model-command-result',
        result: { status: 'answered', message: 'Try buying milk.' },
        resourceEvidence: {
          visibility: 'summary',
          model: { attempts: 2, totalTokens: 30, durationMs: 200 },
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain('gpt-test');
    expect(JSON.stringify(response)).not.toContain('resourceUsage');

    const undisclosed = await protocol.dispatcher(
      request('model.command', { version: 1, kind: 'model-command', text: 'suggest another item' }),
      { principal: null },
    );
    expect(JSON.stringify(undisclosed)).not.toContain('resourceEvidence');
    expect(JSON.stringify(undisclosed)).not.toContain('resourceUsage');
  });

  it('captures direct Graph Commands and applies an explicit authority projection', async () => {
    const { application } = createApplication();
    const projectCommittedMutations = vi.fn((mutations, { context }) =>
      context.principal ? mutations : undefined,
    );
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectCommittedMutations,
    });
    const body = {
      version: 3,
      kind: 'graph-command',
      command: {
        kind: 'entity-mutation-command',
        action: 'update',
        entityName: 'Todo',
        target: {
          kind: 'selection',
          entityName: 'Todo',
          expression: { kind: 'all' },
        },
        values: { completed: true },
      },
    } as const;
    const accepted = createRuntimeProtocolRequest({
      id: 'graph-command-mutations',
      family: 'graph.command',
      body,
      accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
    });

    await expect(
      protocol.dispatcher(accepted, {
        principal: { kind: 'user', subject: 'user-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'graph-command-result' },
      metadata: {
        committedMutations: {
          precision: 'intensional',
          mutations: [
            {
              effect: {
                kind: 'selection-change',
                selection: { entityName: 'Todo' },
              },
              provenance: 'declared',
            },
          ],
        },
      },
    });
    await expect(protocol.dispatcher(accepted, { principal: null })).resolves.not.toHaveProperty(
      'metadata',
    );
    expect(projectCommittedMutations).toHaveBeenCalledTimes(2);
  });

  it('projects mutations committed by an immediate Model Command', async () => {
    const { application } = createApplication();
    const projectCommittedMutations = vi.fn(mutations => mutations);
    const submit = vi.fn(async () => {
      declareSelectionChange({
        kind: 'selection',
        entityName: 'TodoList',
        expression: { kind: 'all' },
      });
      return {
        status: 'executed' as const,
        message: 'List created.',
        request: {
          kind: 'invoke' as const,
          operationId: 'TodoList.create',
          input: { name: 'Supermarket' },
        },
      };
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      modelCommand: { runtime: { submit } },
      projectCommittedMutations,
    });
    const accepted = createRuntimeProtocolRequest({
      id: 'model-command-mutations',
      family: 'model.command',
      body: {
        version: 1,
        kind: 'model-command',
        text: 'Create new list supermarket',
      },
      accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
    });

    await expect(
      protocol.dispatcher(accepted, {
        principal: { kind: 'user', subject: 'user-1' },
      }),
    ).resolves.toMatchObject({
      kind: 'response',
      body: {
        kind: 'model-command-result',
        result: { status: 'executed' },
      },
      metadata: {
        committedMutations: {
          mutations: [
            {
              effect: {
                kind: 'selection-change',
                selection: { entityName: 'TodoList' },
              },
            },
          ],
        },
      },
    });
    expect(projectCommittedMutations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ family: 'model.command' }),
    );
  });

  it('reports delivery failures without changing an already committed response', async () => {
    const { application } = createApplication();
    const reportError = vi.fn();
    const previousDelivery = vi.fn(() => {
      throw new Error('delivery failed');
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      reportError,
    });
    const context = {
      principal: { kind: 'user', subject: 'user-1' } as const,
      resources: new Map([[COMMITTED_MUTATION_DELIVERY_RESOURCE_KEY, previousDelivery]]),
    } as Context;

    await expect(
      protocol.dispatcher(
        request('graph.command', {
          version: 3,
          kind: 'graph-command',
          command: {
            kind: 'entity-mutation-command',
            action: 'update',
            entityName: 'Todo',
            target: {
              kind: 'selection',
              entityName: 'Todo',
              expression: { kind: 'all' },
            },
            values: { completed: true },
          },
        }),
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'graph-command-result' },
    });
    expect(previousDelivery).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'delivery failed' }),
    );
  });

  it('reauthorizes active Graph Reads after a possibly overlapping commit', async () => {
    const { application } = createApplication();
    const readAuthorities: Context[] = [];
    let revision = 0;
    application.createGraphReadDispatcher = (<TAuthority>() =>
      async (_request: unknown, { authority }: GraphReadDispatchContext<TAuthority>) => {
        readAuthorities.push(authority as Context);
        revision += 1;
        return { kind: 'graph-read-result' as const, value: [{ revision }] };
      }) as Application['createGraphReadDispatcher'];
    application.createGraphReadObserver = (<TAuthority>() =>
      async function* (
        _request: unknown,
        { signal }: GraphReadDispatchContext<TAuthority> & { readonly signal: AbortSignal },
      ): AsyncIterable<GraphReadObservationResponse> {
        yield { kind: 'graph-read-result' as const, value: [{ revision: 0 }] };
        await new Promise<void>(resolve => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }) as Application['createGraphReadObserver'];
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectCommittedMutations: mutations => mutations,
    });
    const observerContext: Context = {
      principal: { kind: 'user', subject: 'observer' },
    };
    const controller = new AbortController();
    const iterator = protocol
      .observeGraph(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
        { context: observerContext, signal: controller.signal },
      )
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { kind: 'graph-read-result', value: [{ revision: 0 }] },
    });
    const mutationResponse = await protocol.dispatcher(
      createRuntimeProtocolRequest({
        id: 'causal-command',
        family: 'graph.command',
        accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
        body: {
          version: 3,
          kind: 'graph-command',
          command: {
            kind: 'entity-mutation-command',
            action: 'update',
            entityName: 'Todo',
            target: {
              kind: 'selection',
              entityName: 'Todo',
              expression: { kind: 'all' },
            },
            values: { completed: true },
          },
        },
      }),
      { principal: { kind: 'user', subject: 'mutator' } },
    );

    const refresh = await iterator.next();
    expect(refresh).toMatchObject({
      done: false,
      value: { kind: 'graph-read-result', value: [{ revision: 1 }] },
    });
    expect(refresh.value).toMatchObject({
      causedBy: {
        kind: 'committed-mutations',
        commitIds: [
          (mutationResponse as { metadata: { mutationCommitId: string } }).metadata
            .mutationCommitId,
        ],
        overflow: false,
      },
    });
    expect(readAuthorities).toEqual([observerContext]);

    controller.abort();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('falls back to semantic reads when native Graph observation is unavailable', async () => {
    const { application } = createApplication();
    let revision = 0;
    application.createGraphReadDispatcher = vi.fn(() => async () => ({
      kind: 'graph-read-result' as const,
      value: [{ revision: revision++ }],
    }));
    application.createGraphReadObserver = vi.fn(
      () =>
        async function* () {
          yield {
            kind: 'protocol-error' as const,
            error: {
              code: 'execution_unavailable' as const,
              message: 'Data graph read execution is temporarily unavailable.',
            },
          };
        },
    );
    const protocol = createApplicationRuntimeProtocol({ application, policies: [] });
    const controller = new AbortController();
    const context: Context = { principal: { kind: 'user', subject: 'observer' } };
    const iterator = protocol
      .observeGraph(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
        { context, signal: controller.signal },
      )
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { kind: 'graph-read-result', value: [{ revision: 0 }] },
    });

    await protocol.dispatcher(
      request('graph.command', {
        version: 3,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Todo',
          target: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          values: { completed: true },
        },
      }),
      context,
    );

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        kind: 'graph-read-result',
        value: [{ revision: 1 }],
        causedBy: { kind: 'committed-mutations' },
      },
    });
    controller.abort();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('does not refresh active Graph Reads when mutation execution fails', async () => {
    const { application } = createApplication();
    const read = vi.fn(async () => ({
      kind: 'graph-read-result' as const,
      value: [{ revision: 1 }],
    }));
    application.createGraphReadDispatcher = (() =>
      read) as Application['createGraphReadDispatcher'];
    application.createGraphReadObserver = (<TAuthority>() =>
      async function* (
        _request: unknown,
        { signal }: GraphReadDispatchContext<TAuthority> & { readonly signal: AbortSignal },
      ): AsyncIterable<GraphReadObservationResponse> {
        yield { kind: 'graph-read-result', value: [{ revision: 0 }] };
        await new Promise<void>(resolve => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }) as Application['createGraphReadObserver'];
    application.createGraphCommandDispatcher = vi.fn(() => async () => {
      declareSelectionChange({
        kind: 'selection',
        entityName: 'Todo',
        expression: { kind: 'all' },
      });
      throw new Error('rolled back');
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
    });
    const controller = new AbortController();
    const context: Context = { principal: { kind: 'user', subject: 'observer' } };
    const iterator = protocol
      .observeGraph(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
        { context, signal: controller.signal },
      )
      [Symbol.asyncIterator]();
    await iterator.next();

    await protocol.dispatcher(
      request('graph.command', {
        version: 3,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Todo',
          target: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          values: { completed: true },
        },
      }),
      context,
    );
    await Promise.resolve();

    expect(read).not.toHaveBeenCalled();
    controller.abort();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('keeps semantic observation active after its native source ends', async () => {
    const { application } = createApplication();
    application.createGraphReadObserver = vi.fn(() => async function* () {});
    application.createGraphReadDispatcher = vi.fn(() => async () => ({
      kind: 'graph-read-result' as const,
      value: { invalid: true },
    }));
    const protocol = createApplicationRuntimeProtocol({ application, policies: [] });
    const controller = new AbortController();
    const context: Context = { principal: { kind: 'user', subject: 'observer' } };
    const iterator = protocol
      .observeGraph(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
        { context, signal: controller.signal },
      )
      [Symbol.asyncIterator]();
    const next = iterator.next();
    await Promise.resolve();

    await protocol.dispatcher(
      request('graph.command', {
        version: 3,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Todo',
          target: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          values: { completed: true },
        },
      }),
      context,
    );

    await expect(next).resolves.toMatchObject({
      done: false,
      value: { kind: 'protocol-error', error: { code: 'execution_unavailable' } },
    });
    controller.abort();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });

  it('deduplicates equal native and semantic snapshots for one commit', async () => {
    const { application } = createApplication();
    let publishNative!: (body: GraphReadObservationResponse) => void;
    const nativeUpdate = new Promise<GraphReadObservationResponse>(resolve => {
      publishNative = resolve;
    });
    application.createGraphReadObserver = (<TAuthority>() =>
      async function* (
        _request: unknown,
        { signal }: GraphReadDispatchContext<TAuthority> & { readonly signal: AbortSignal },
      ): AsyncIterable<GraphReadObservationResponse> {
        yield { kind: 'graph-read-result', value: [{ revision: 0 }] };
        yield await nativeUpdate;
        await new Promise<void>(resolve => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }) as Application['createGraphReadObserver'];
    application.createGraphReadDispatcher = vi.fn(() => async () => ({
      kind: 'graph-read-result' as const,
      value: [{ revision: 1 }],
    }));
    const protocol = createApplicationRuntimeProtocol({ application, policies: [] });
    const controller = new AbortController();
    const context: Context = { principal: { kind: 'user', subject: 'observer' } };
    const iterator = protocol
      .observeGraph(
        {
          version: 1,
          kind: 'graph-read',
          mode: 'run',
          selection: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          orderBy: [],
        },
        { context, signal: controller.signal },
      )
      [Symbol.asyncIterator]();
    await iterator.next();
    await protocol.dispatcher(
      request('graph.command', {
        version: 3,
        kind: 'graph-command',
        command: {
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'Todo',
          target: {
            kind: 'selection',
            entityName: 'Todo',
            expression: { kind: 'all' },
          },
          values: { completed: true },
        },
      }),
      context,
    );
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { kind: 'graph-read-result', value: [{ revision: 1 }] },
    });

    publishNative({ kind: 'graph-read-result', value: [{ revision: 1 }] });
    const duplicate = iterator.next();
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(duplicate).resolves.toMatchObject({ done: true });
  });

  it('returns committed mutations beside an Operation result without changing its body', async () => {
    const { application } = createApplication();
    const operation = {
      kind: 'domain-operation' as const,
      id: 'Todo.completeAll',
      entityName: 'Todo',
      name: 'completeAll',
      authority: 'server' as const,
      exposure: 'bridge' as const,
      input: value('CompleteAllInput', { listId: field.nonEmptyString() }),
      layer: 'todos',
      run: vi.fn(),
    };
    application.resolveOperation = () => operation as never;
    application.invokeOperation = vi.fn(async () => {
      recordModelResourceUsage({ provider: 'openai', model: 'gpt-test', totalTokens: 18 });
      declareSelectionChange({
        kind: 'selection',
        entityName: 'Todo',
        expression: {
          kind: 'predicate',
          operator: 'eq',
          fieldName: 'listId',
          value: 'later',
        },
      });
      return { ok: true as const, kind: 'success' as const, value: { completed: 3 } };
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectCommittedMutations: mutations => mutations,
    });
    const accepted = createRuntimeProtocolRequest({
      id: 'operation-mutations',
      family: 'operation',
      body: toOperationProtocolRequest({
        kind: 'invoke',
        operationId: operation.id,
        input: { listId: 'later' },
      }),
      accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
    });

    await expect(
      protocol.dispatcher(accepted, {
        principal: { kind: 'user', subject: 'user-1' },
        resourceEvidenceDisclosure: 'debug',
      }),
    ).resolves.toMatchObject({
      body: {
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: { completed: 3 } },
        resourceEvidence: {
          visibility: 'debug',
          model: {
            attempts: [{ provider: 'openai', model: 'gpt-test', totalTokens: 18 }],
          },
        },
      },
      metadata: {
        committedMutations: {
          mutations: [
            {
              effect: {
                kind: 'selection-change',
                selection: {
                  entityName: 'Todo',
                  expression: { fieldName: 'listId', value: 'later' },
                },
              },
            },
          ],
        },
      },
    });
  });

  it('does not expose server-only Operations through the application Runtime Protocol', async () => {
    const { application } = createApplication();
    const operation = {
      kind: 'domain-operation' as const,
      id: 'Todo.rebuildIndex',
      entityName: 'Todo',
      name: 'rebuildIndex',
      authority: 'server' as const,
      exposure: 'server-only' as const,
      input: value('RebuildIndexInput', {}),
      layer: 'todos',
      run: vi.fn(),
    };
    application.resolveOperation = () => operation as never;
    const protocol = createApplicationRuntimeProtocol({ application, policies: [] });

    await expect(
      protocol.dispatcher(
        request(
          'operation',
          toOperationProtocolRequest({ kind: 'invoke', operationId: operation.id, input: {} }),
        ),
        { principal: { kind: 'user', subject: 'user-1' } },
      ),
    ).resolves.toMatchObject({
      body: {
        kind: 'invocation-result',
        result: { ok: false, kind: 'rejected', reason: 'unknown_operation' },
      },
    });
    expect(application.invokeOperation).not.toHaveBeenCalled();
  });

  it('projects persisted mutations from a terminal durable snapshot outside its body', async () => {
    const { application } = createApplication();
    const terminalSnapshot = {
      ...run,
      status: 'completed' as const,
      updatedAt: '2026-10-03T00:00:00.000Z',
      completedAt: '2026-10-03T00:00:00.000Z',
      result: { completed: 3 },
      executionMetadata: {
        committedMutations: {
          precision: 'widened' as const,
          mutations: [
            {
              effect: { kind: 'graph-change' as const },
              provenance: 'conservative' as const,
            },
          ],
        },
      },
    };
    application.getTaskSnapshot = vi.fn(async () => terminalSnapshot);
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectCommittedMutations: mutations => mutations,
    });
    const accepted = createRuntimeProtocolRequest({
      id: 'durable-mutations',
      family: 'durable.operation',
      body: toDurableOperationProtocolRequest(run),
      accepts: [RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY],
    });

    const response = await protocol.dispatcher(accepted, {
      principal: { kind: 'user', subject: 'user-1' },
    });

    expect(response).toMatchObject({
      body: {
        kind: 'snapshot',
        snapshot: { status: 'completed', result: { completed: 3 } },
      },
      metadata: terminalSnapshot.executionMetadata,
    });
    expect(JSON.stringify(response)).not.toContain('executionMetadata');
  });

  it('supports an explicit system actor and maps task access failures', async () => {
    const { application, respondToTaskInteraction } = createApplication();
    respondToTaskInteraction.mockRejectedValueOnce({
      reason: 'task_interaction_access_denied',
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      taskInteractionActor: () => ({ kind: 'system' }),
    });
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'approve',
      decision: 'approve',
    });

    await expect(
      protocol.dispatcher(request('durable.operation', body), { principal: null }),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'protocol-error', error: { code: 'access_denied' } },
    });
    expect(respondToTaskInteraction).toHaveBeenCalledWith(run, body.response, {
      actor: { kind: 'system' },
    });
  });

  it('unwraps Effect access failures and reports unrelated dispatch failures', async () => {
    const { application, respondToTaskInteraction } = createApplication();
    const reportError = vi.fn();
    let fiberFailure: unknown;
    try {
      await Effect.runPromise(Effect.fail({ reason: 'task_interaction_access_denied' }));
    } catch (error) {
      fiberFailure = error;
    }
    respondToTaskInteraction
      .mockRejectedValueOnce(fiberFailure)
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      reportError,
    });
    const body = toDurableOperationInteractionResponseRequest(run, {
      interactionId: 'approve',
      decision: 'approve',
    });
    const context: Context = { principal: { kind: 'user', subject: 'user-1' } };

    await expect(
      protocol.dispatcher(request('durable.operation', body), context),
    ).resolves.toMatchObject({
      kind: 'response',
      body: { kind: 'protocol-error', error: { code: 'access_denied' } },
    });
    await expect(
      protocol.dispatcher(request('durable.operation', body), context),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'dispatch_unavailable' },
    });
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'storage unavailable' }),
    );
  });

  it('exposes remote Event observation only through an explicit payload projector', async () => {
    const { application } = createApplication();
    let subscriber: ((delivery: EventDelivery) => void | Promise<void>) | undefined;
    const cancel = vi.fn();
    Object.assign(application, {
      events: {
        subscribeByIdentity: vi.fn(
          (_eventId: string, _eventVersion: number, next: typeof subscriber) => {
            subscriber = next;
            return { id: 'subscription-1', cancel };
          },
        ),
      },
    });
    const withoutProjection = createApplicationRuntimeProtocol({ application, policies: [] });
    expect(withoutProjection.observeEvent).toBeUndefined();

    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectEventDelivery: delivery => ({
        ...delivery,
        occurrence: {
          ...delivery.occurrence,
          payload: {
            visible: (delivery.occurrence.payload as { readonly visible: number }).visible,
          },
        },
      }),
    });
    const controller = new AbortController();
    const iterator = protocol.observeEvent!(
      { id: 'TodoListCompleted', version: 1 },
      {
        context: { principal: { kind: 'user', subject: 'user-1' } },
        signal: controller.signal,
      },
    )[Symbol.asyncIterator]();
    const next = iterator.next();
    await subscriber?.({
      kind: 'event-delivery',
      deliveryId: 'delivery-1',
      subscriptionId: 'subscription-1',
      attempt: 1,
      occurrence: {
        kind: 'event-occurrence',
        occurrenceId: 'occurrence-1',
        eventId: 'TodoListCompleted',
        eventVersion: 1,
        occurredAt: '2026-10-12T00:00:00.000Z',
        payload: { visible: 2, secret: 'redacted' },
      },
    });

    await expect(next).resolves.toMatchObject({
      done: false,
      value: { occurrence: { payload: { visible: 2 } } },
    });
    expect((await next).value.occurrence.payload).not.toHaveProperty('secret');
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('serializes Event projection and terminates on projector failure', async () => {
    const { application } = createApplication();
    let subscriber: ((delivery: EventDelivery) => void | Promise<void>) | undefined;
    Object.assign(application, {
      events: {
        subscribeByIdentity: (_id: string, _version: number, next: typeof subscriber) => {
          subscriber = next;
          return { id: 'subscription-1', cancel: vi.fn() };
        },
      },
    });
    let releaseFirst!: () => void;
    const firstProjection = new Promise<void>(resolve => (releaseFirst = resolve));
    const projected: string[] = [];
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectEventDelivery: async delivery => {
        projected.push(delivery.deliveryId);
        if (delivery.deliveryId === 'delivery-1') await firstProjection;
        if (delivery.deliveryId === 'delivery-failed') throw new Error('projection failed');
        return delivery;
      },
    });
    const controller = new AbortController();
    const iterator = protocol.observeEvent!(
      { id: 'Event', version: 1 },
      { context: { principal: null }, signal: controller.signal },
    )[Symbol.asyncIterator]();
    const firstNext = iterator.next();
    const delivery = (deliveryId: string): EventDelivery => ({
      kind: 'event-delivery',
      deliveryId,
      subscriptionId: 'subscription-1',
      attempt: 1,
      occurrence: {
        kind: 'event-occurrence',
        occurrenceId: deliveryId,
        eventId: 'Event',
        eventVersion: 1,
        occurredAt: '2026-10-12T00:00:00.000Z',
        payload: {},
      },
    });
    const first = subscriber!(delivery('delivery-1'));
    const second = subscriber!(delivery('delivery-2'));
    await Promise.resolve();
    expect(projected).toEqual(['delivery-1']);
    releaseFirst();
    await Promise.all([first, second]);
    await expect(firstNext).resolves.toMatchObject({ value: { deliveryId: 'delivery-1' } });
    await expect(iterator.next()).resolves.toMatchObject({ value: { deliveryId: 'delivery-2' } });
    const failedNext = iterator.next();
    await subscriber!(delivery('delivery-failed'));
    await expect(failedNext).rejects.toThrow('projection failed');
  });

  it('bounds the projected Event delivery queue', async () => {
    const { application } = createApplication();
    let subscriber: ((delivery: EventDelivery) => void | Promise<void>) | undefined;
    Object.assign(application, {
      events: {
        subscribeByIdentity: (_id: string, _version: number, next: typeof subscriber) => {
          subscriber = next;
          return { id: 'subscription-1', cancel: vi.fn() };
        },
      },
    });
    const protocol = createApplicationRuntimeProtocol({
      application,
      policies: [],
      projectEventDelivery: delivery => delivery,
    });
    const iterator = protocol.observeEvent!(
      { id: 'Event', version: 1 },
      { context: { principal: null }, signal: new AbortController().signal },
    )[Symbol.asyncIterator]();
    const first = iterator.next();
    for (let index = 0; index < 258; index += 1) {
      await subscriber!({
        kind: 'event-delivery',
        deliveryId: `delivery-${index}`,
        subscriptionId: 'subscription-1',
        attempt: 1,
        occurrence: {
          kind: 'event-occurrence',
          occurrenceId: `occurrence-${index}`,
          eventId: 'Event',
          eventVersion: 1,
          occurredAt: '2026-10-12T00:00:00.000Z',
          payload: {},
        },
      });
    }
    await first;
    for (let index = 0; index < 256; index += 1) await iterator.next();
    await expect(iterator.next()).rejects.toThrow('queue overflowed');
  });
});
