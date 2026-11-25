import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryDataGraphStorage, field, graphSchema } from '../../data-graph/index.js';

import { configureServerRuntime, resetServerRuntimeForTests } from './config.js';
import {
  createGraphHttpIngressOperationDispatcher,
  createGraphHttpIngressRoute,
} from './ingress.js';

import {
  createInMemoryTaskStorage,
  createOperationInvocationDispatcher,
  defineIdempotentTaskEffect,
  defineTaskExecution,
  defineTaskExecutionStep,
  effect,
  entity,
  inProcessTasks,
  ontahi,
} from './index.js';

describe('durable Operation admission from HTTP ingress', () => {
  afterEach(resetServerRuntimeForTests);

  it.each([
    { policy: 'reuse-running', expired: false },
    { policy: 'skip-if-completed', expired: false },
    { policy: 'skip-if-completed', expired: true },
    { policy: 'skip-if-completed', expired: false, providerTimeout: true },
  ] as const)(
    'selects the expected run with $policy after losing a response (expired=$expired)',
    async ({ policy, expired, providerTimeout = false }) => {
      const admissionSpans: Record<string, unknown>[] = [];
      configureServerRuntime({
        telemetry: {
          withSpan: async (name, { attributes }, run) => {
            const span = { ...attributes };
            if (name === 'ontahi.task.admission') admissionSpans.push(span);
            return run(span);
          },
          markSuccess: (span, attributes) => Object.assign(span as object, attributes),
          markFailure: () => {},
          getRuntimeAttributes: () => ({}),
        },
      });
      const storage = createInMemoryTaskStorage();
      const customers = new Map<string, { name: string; id: string }>();
      const requests: { key: string; name: string }[] = [];
      const createRemoteCustomer = (key: string, name: string) =>
        Effect.suspend(() => {
          requests.push({ key, name });
          const existing = customers.get(key);
          if (existing) {
            if (existing.name !== name)
              return Effect.dieMessage('Provider key reused with different input');
            return Effect.succeed(existing);
          }
          const created = { name, id: `remote-${customers.size + 1}` };
          customers.set(key, created);
          // The remote commit survives while the original worker never receives a response.
          if (requests.length !== 1) return Effect.succeed(created);
          return providerTimeout
            ? Effect.fail({ reason: 'remote_timeout', message: 'Response lost' })
            : Effect.never;
        });
      const remoteCreate = defineIdempotentTaskEffect({
        id: 'create-remote-customer',
        retryWindowMs: 60_000,
        execute: (input: { name: string }, key) => createRemoteCustomer(key, input.name),
      });
      type State = { step: string; effect?: ReturnType<typeof remoteCreate.prepare> };
      type Input = { name: string };
      type Customer = { id: string; name: string };
      const Job = entity({
        name: 'RemoteCustomer',
        fields: { id: field.id() },
        operations: ({ operation }) => ({
          sync: operation({
            input: graphSchema.object({ name: graphSchema.string() }),
            durable: {
              runtime: 'in-process',
              idempotency: { policy },
              externalEffects: [remoteCreate.metadata],
              execution: defineTaskExecution<Input, State, Customer>({
                initial: () => ({ step: 'prepare' }),
                steps: {
                  prepare: defineTaskExecutionStep({
                    run: ({ context, input }) =>
                      Effect.succeed({
                        kind: 'continue' as const,
                        state: {
                          step: 'create',
                          effect: remoteCreate.prepare(context, 'customer', input),
                        },
                      }),
                  }),
                  create: defineTaskExecutionStep<Input, State, Customer>({
                    run: ({ state }) =>
                      state.effect
                        ? remoteCreate
                            .run(state.effect)
                            .pipe(Effect.map(result => ({ kind: 'complete' as const, result })))
                        : Effect.dieMessage('Effect checkpoint missing'),
                  }),
                },
              }),
            },
            run: () => Effect.dieMessage('Explicit task execution is required'),
          }),
        }),
      });
      const application = () =>
        ontahi({
          storage: createInMemoryDataGraphStorage(),
          tasks: inProcessTasks({ storage }),
          entities: [Job],
        });
      const ingressFor = (app: ReturnType<typeof application>) => {
        const dispatch = createOperationInvocationDispatcher(app);
        const results: unknown[] = [];
        const handle = createGraphHttpIngressRoute({
          provider: {
            receive: async request =>
              request.headers.get('authorization') === 'Bearer fixture'
                ? {
                    kind: 'accepted',
                    provider: 'fixture',
                    event: 'customer.created',
                    deliveryId: 'delivery-1',
                    requestId: 'request-1',
                    payload: { name: 'Ada' },
                  }
                : { kind: 'rejected', status: 401, error: 'Unauthorized' },
          },
          routes: [{ operationId: 'RemoteCustomer.sync', method: 'POST', route: '/webhook' }],
          dispatch: createGraphHttpIngressOperationDispatcher({
            dispatcher: async request => {
              const response = await dispatch(request);
              if (response.kind === 'invocation-result' && response.result.ok) {
                results.push(response.result.value);
              }
              return response;
            },
          }),
        });
        return { handle, results };
      };
      const initialApplication = application();
      expect(initialApplication.graph.describe().durableOperations).toEqual([
        expect.objectContaining({
          idempotencyPolicy: policy,
          idempotencyEnforced: true,
          externalEffects: [remoteCreate.metadata],
          externalEffectCoverage: 'unverified',
        }),
      ]);
      const first = ingressFor(initialApplication);
      const deliver = (handler: typeof first.handle, authorized = true) =>
        handler(
          new Request('http://localhost/webhook', {
            method: 'POST',
            headers: authorized ? { authorization: 'Bearer fixture' } : {},
          }),
        );

      expect((await deliver(first.handle, false)).status).toBe(401);
      expect(await Effect.runPromise(storage.listRecent())).toEqual([]);
      const deliveries = await Promise.all([deliver(first.handle), deliver(first.handle)]);
      expect(deliveries.map(response => response.status)).toEqual([200, 200]);
      expect(first.results).toHaveLength(2);
      const { taskId, runId } = first.results[0] as { taskId: string; runId: string };
      const run = { taskId, runId };
      for (const result of first.results) expect(result).toMatchObject(run);
      if (providerTimeout) {
        await vi.waitFor(async () => {
          expect(await initialApplication.getTaskSnapshot(run)).toMatchObject({
            status: 'failed',
            error: { code: 'task_effect_outcome_ambiguous' },
          });
        });
        const retry = ingressFor(initialApplication);
        expect((await deliver(retry.handle)).status).toBe(200);
        expect(retry.results[0]).toMatchObject({ ...run, admission: 'reconciliation-required' });
        expect((await Effect.runPromise(storage.loadSource(run))).checkpoint).toBeDefined();
        expect(requests).toHaveLength(1);
        return;
      }
      expect(first.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ admission: 'created' }),
          expect.objectContaining({ admission: 'reused' }),
        ]),
      );
      expect(admissionSpans).toHaveLength(2);
      expect(admissionSpans[0]?.['ontahi.task.admission_key']).toMatch(/^[a-f0-9]{64}$/);
      for (const span of admissionSpans) {
        expect(span).toMatchObject({
          'ontahi.task.run_id': runId,
          'ontahi.ingress.delivery_id': 'delivery-1',
          'ontahi.invocation.request_id': 'request-1',
          'ontahi.task.admission_key': admissionSpans[0]?.['ontahi.task.admission_key'],
        });
      }
      expect(new Set(admissionSpans.map(span => span['ontahi.task.admission']))).toEqual(
        new Set(['created', 'reused']),
      );
      await vi.waitFor(() => expect(customers.size).toBe(1));
      expect(await Effect.runPromise(storage.loadSource(run))).toMatchObject({
        status: 'running',
        trigger: { ingress: { kind: 'http', deliveryId: 'delivery-1', requestId: 'request-1' } },
        checkpoint: {
          state: { effect: { providerKey: requests[0]!.key, input: { name: 'Ada' } } },
        },
      });

      if (expired) {
        const source = await Effect.runPromise(storage.loadSource(run));
        const checkpoint = source.checkpoint!;
        const state = checkpoint.state as State;
        await Effect.runPromise(
          storage.update(run, {
            checkpoint: {
              ...checkpoint,
              state: { ...state, effect: { ...state.effect!, retryUntil: 0 } },
            } as typeof checkpoint,
          }),
        );
      }

      const restarted = application();
      if (expired) {
        await vi.waitFor(async () => {
          expect(await restarted.getTaskSnapshot(run)).toMatchObject({
            status: 'failed',
            error: { code: 'task_effect_outcome_ambiguous' },
          });
        });
        const retry = ingressFor(restarted);
        expect((await deliver(retry.handle)).status).toBe(200);
        expect(retry.results[0]).toMatchObject({ ...run, admission: 'reconciliation-required' });
        expect(requests).toHaveLength(1);
        expect(await Effect.runPromise(storage.listRecent())).toHaveLength(1);
        expect((await Effect.runPromise(storage.loadSource(run))).checkpoint).toBeDefined();
        return;
      }
      await vi.waitFor(async () => {
        expect(await restarted.getTaskSnapshot(run)).toMatchObject({
          status: 'completed',
          result: { id: 'remote-1', name: 'Ada' },
        });
      });
      expect(requests).toEqual([requests[0], requests[0]]);
      expect(customers.size).toBe(1);

      const retry = ingressFor(restarted);
      expect((await deliver(retry.handle)).status).toBe(200);
      if (policy === 'skip-if-completed') {
        expect(retry.results[0]).toMatchObject({
          ...run,
          status: 'completed',
          admission: 'already-completed',
        });
        expect(await Effect.runPromise(storage.listRecent())).toHaveLength(1);
      } else {
        expect(retry.results[0]).not.toMatchObject(run);
        expect(await Effect.runPromise(storage.listRecent())).toHaveLength(2);
      }
    },
  );
});

describe('durable Operation admission failures', () => {
  afterEach(resetServerRuntimeForTests);

  it.each([
    { policy: 'reuse-running', key: undefined, expected: 'task_admission_key_missing' },
    { policy: 'reuse-running', key: () => new Array(1), expected: 'task_admission_key_invalid' },
    { policy: 'replace-running', key: () => 'customer', expected: 'task_admission_unavailable' },
    {
      policy: 'queue-after-current',
      key: () => 'customer',
      expected: 'task_admission_unavailable',
    },
  ] as const)('rejects $expected from $policy before creating a run', async row => {
    const storage = createInMemoryTaskStorage();
    const Customer = entity({
      name: 'AdmissionCustomer',
      fields: { id: field.id() },
      operations: ({ operation }) => ({
        sync: operation({
          durable: { runtime: 'in-process', idempotency: { policy: row.policy, key: row.key } },
          run: () => Effect.succeed(undefined),
        }),
      }),
    });
    const app = ontahi({
      storage: createInMemoryDataGraphStorage(),
      tasks: inProcessTasks({ storage }),
      entities: [Customer],
    });
    const response = await createOperationInvocationDispatcher(app)({
      kind: 'invoke',
      operationId: 'AdmissionCustomer.sync',
      input: {},
    });
    expect(response).toMatchObject({
      kind: 'invocation-result',
      result: { ok: false, kind: 'failed', failure: { reason: row.expected } },
    });
    expect(await Effect.runPromise(storage.listRecent())).toEqual([]);
  });

  it('reflects named and unnamed reconciliation contracts, and allows distinct runs without an admission key', async () => {
    const storage = createInMemoryTaskStorage();
    const lookup = () => Effect.succeed({ kind: 'confirmed-absent' } as const);
    const execute = (input: string) => Effect.succeed(input);
    const named = effect.reconcilable({ id: 'named', lookup, execute });
    const unnamed = effect.reconcilable({ lookup, execute });
    const Customer = entity({
      name: 'ConcurrentCustomer',
      fields: { id: field.id() },
      operations: ({ operation }) => ({
        sync: operation({
          durable: {
            runtime: 'in-process',
            idempotency: { policy: 'allow-concurrent' },
            externalEffects: [named.metadata, unnamed.metadata],
          },
          run: () => Effect.succeed(undefined),
        }),
      }),
    });
    const app = ontahi({
      storage: createInMemoryDataGraphStorage(),
      tasks: inProcessTasks({ storage }),
      entities: [Customer],
    });
    expect(app.graph.describe().durableOperations).toEqual([
      expect.objectContaining({
        idempotencyEnforced: false,
        externalEffects: [
          { id: 'named', replay: 'external-reference-reconciliation' },
          { replay: 'external-reference-reconciliation' },
        ],
        externalEffectCoverage: 'unverified',
      }),
    ]);
    const dispatch = createOperationInvocationDispatcher(app);
    const request = { kind: 'invoke', operationId: 'ConcurrentCustomer.sync', input: {} } as const;
    const first = await dispatch(request);
    const second = await dispatch(request);
    expect(first).toMatchObject({ result: { ok: true } });
    expect(second).toMatchObject({ result: { ok: true } });
    expect(await Effect.runPromise(storage.listRecent())).toHaveLength(2);
  });

  it('returns the accepted run when admission telemetry fails', async () => {
    const storage = createInMemoryTaskStorage();
    configureServerRuntime({
      telemetry: {
        withSpan: async (name, _options, run) => {
          if (name === 'ontahi.task.admission') throw new Error('Telemetry backend unavailable');
          return run({});
        },
        markSuccess: () => {},
        markFailure: () => {},
        getRuntimeAttributes: () => ({}),
      },
    });
    const Customer = entity({
      name: 'TracedCustomer',
      fields: { id: field.id() },
      operations: ({ operation }) => ({
        sync: operation({
          durable: {
            runtime: 'in-process',
            idempotency: { policy: 'skip-if-completed', key: () => 'customer' },
          },
          run: () => Effect.succeed(undefined),
        }),
      }),
    });
    const app = ontahi({
      storage: createInMemoryDataGraphStorage(),
      tasks: inProcessTasks({ storage }),
      entities: [Customer],
    });
    const response = await createOperationInvocationDispatcher(app)({
      kind: 'invoke',
      operationId: 'TracedCustomer.sync',
      input: {},
    });
    expect(response).toMatchObject({
      kind: 'invocation-result',
      result: { ok: true, value: { taskId: 'TracedCustomer.sync', admission: 'created' } },
    });
    expect(await Effect.runPromise(storage.listRecent())).toHaveLength(1);
  });
});
