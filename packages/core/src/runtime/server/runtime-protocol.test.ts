import { Effect, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { field, value } from '../../data-graph/index.js';
import {
  createRuntimeProtocolRequest,
  RUNTIME_PROTOCOL_COMMITTED_MUTATIONS_CAPABILITY,
  toDurableOperationInteractionResponseRequest,
  toDurableOperationProtocolRequest,
  toOperationProtocolRequest,
} from '../protocol/index.js';

import {
  getCurrentInvocationContext,
  withInvocationContext as runWithInvocationContext,
} from './invocation-context.js';
import {
  createApplicationRuntimeProtocol,
  type ApplicationRuntimeProtocolOptions,
} from './runtime-protocol.js';
import { declareSelectionChange } from './unit-of-work.js';

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
      }),
    ).resolves.toMatchObject({
      body: {
        kind: 'invocation-result',
        result: { ok: true, kind: 'success', value: { completed: 3 } },
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
});
