import { Effect, Stream } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createEntityRef,
  entity,
  field,
  graphSchema,
  type DataGraphExecutionRuntime,
  type DataGraphTransactionCapability,
} from '../../../data-graph/index.js';
import {
  createDataGraphArchitectureAdapter,
  createOperationFailure,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  getCurrentDataGraphRuntime,
  runServerDomainOperationRaw,
} from '../index.js';

type Runtime = DataGraphExecutionRuntime<never>;
type TransactionRuntime = Runtime & DataGraphTransactionCapability<Runtime>;

const RecordDefinition = entity('AtomicRecord', {
  id: field.id(),
  revision: field.integer(),
});

const createRuntime = (runCommand: Runtime['runCommand']): Runtime => ({
  get: () => Effect.succeed(null),
  run: () => Effect.succeed([]),
  count: () => Effect.succeed(0),
  stream: () => Stream.empty,
  runCommand,
});

const createTransactionalRecordFixture = () => {
  const state = { revisions: 0 };
  let pendingRevisions = 0;
  const transactionRuntime = createRuntime(<TResult>() => {
    pendingRevisions += 1;
    return Effect.succeed(undefined as TResult);
  });
  const parentRuntime = Object.assign(
    createRuntime(<TResult>() => Effect.succeed(undefined as TResult)),
    {
      transaction: <TValue, TError, TRequirements>(
        work: (runtime: Runtime) => Effect.Effect<TValue, TError, TRequirements>,
      ) =>
        Effect.suspend(() => {
          pendingRevisions = state.revisions;
          return work(transactionRuntime).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                state.revisions = pendingRevisions;
              }),
            ),
          );
        }),
    },
  ) satisfies TransactionRuntime;
  const graph = createDataGraphArchitectureAdapter<
    unknown,
    never,
    undefined,
    undefined,
    TransactionRuntime
  >({
    createRuntime: () => parentRuntime,
  });

  return {
    graph,
    records: graph.bindSelectionEntity(RecordDefinition),
    state,
  };
};

describe('atomic Domain Operations', () => {
  it('authors and reflects atomicity without a manually duplicated capability list', () => {
    const mutate = defineDomainOperation.atomic({
      run: () => Effect.void,
    });

    expect(mutate.execution).toEqual({ atomicity: 'required' });
    expect('requiredCapabilities' in mutate.execution).toBe(false);
    expectTypeOf(mutate.execution.atomicity).toEqualTypeOf<'required'>();
  });

  it('rejects atomicity on durable Operations before creating a deferred task', () => {
    expect(() =>
      defineDomainOperation({
        durable: { runtime: 'in-process' },
        execution: { atomicity: 'required' },
        run: () => Effect.void,
      } as never),
    ).toThrow('Durable Domain Operations cannot require one Data Graph atomic boundary.');
  });

  it('runs callback preconditions, body, and postconditions inside one committed boundary', async () => {
    const events: string[] = [];
    const state = { revisions: 0 };
    let pendingRevisions = 0;
    const transactionRuntime = createRuntime(<TResult>() => {
      events.push('body');
      pendingRevisions += 1;
      return Effect.succeed(undefined as TResult);
    });
    const parentRuntime = Object.assign(
      createRuntime(<TResult>() => Effect.succeed(undefined as TResult)),
      {
        transaction: <TValue, TError, TRequirements>(
          work: (runtime: Runtime) => Effect.Effect<TValue, TError, TRequirements>,
        ) =>
          Effect.gen(function* () {
            events.push('transaction:start');
            pendingRevisions = state.revisions;
            const value = yield* work(transactionRuntime);
            state.revisions = pendingRevisions;
            events.push('transaction:commit');
            return value;
          }),
      },
    ) satisfies TransactionRuntime;
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      undefined,
      undefined,
      TransactionRuntime
    >({
      createRuntime: () => parentRuntime,
    });
    const records = graph.bindSelectionEntity(RecordDefinition);
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          requires: [
            {
              run: () =>
                Effect.sync(() => {
                  events.push('requirement');
                }),
            },
          ],
          contracts: {
            pre: () => {
              events.push('pre');
            },
            post: () => {
              events.push('post');
            },
          },
          run: () => records.insert({ id: 'record-1', revision: 1 }).run(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic' },
    ).mutate;

    await expect(runServerDomainOperationRaw(mutate, {})).resolves.toEqual({ success: true });
    expect(state.revisions).toBe(1);
    expect(events).toEqual([
      'transaction:start',
      'requirement',
      'pre',
      'body',
      'post',
      'transaction:commit',
    ]);
  });

  it('materializes existing Ref participants after requirements and inside the transaction', async () => {
    const events: string[] = [];
    const transactionRuntime = createRuntime(<TResult>() => Effect.succeed(undefined as TResult));
    const parentRuntime = Object.assign(
      createRuntime(<TResult>() => Effect.succeed(undefined as TResult)),
      {
        transaction: <TValue, TError, TRequirements>(
          work: (runtime: Runtime) => Effect.Effect<TValue, TError, TRequirements>,
        ) =>
          Effect.gen(function* () {
            events.push('transaction:start');
            const value = yield* work(transactionRuntime);
            events.push('transaction:commit');
            return value;
          }),
      },
    ) satisfies TransactionRuntime;
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      undefined,
      undefined,
      TransactionRuntime
    >({ createRuntime: () => parentRuntime });
    const existingRecord = graphSchema.existingRef(RecordDefinition).resolveWith(() =>
      Effect.sync(() => {
        events.push(
          getCurrentDataGraphRuntime() === transactionRuntime
            ? 'resolve:transaction'
            : 'resolve:outside',
        );
        return { id: 'record-1', revision: 1 };
      }),
    );
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          input: graphSchema.object({ record: existingRecord }),
          requires: [
            {
              run: () =>
                Effect.sync(() => {
                  events.push('requirement');
                }),
            },
          ],
          concerns: [graph.withRuntime()],
          contracts: {
            pre: () => {
              events.push('pre');
            },
            post: () => {
              events.push('post');
            },
          },
          run: ({ record }) =>
            Effect.sync(() => {
              events.push('body');
              return { id: record.id, ref: record.ref };
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.atomic.existing-ref' },
    ).mutate;
    const record = createEntityRef(RecordDefinition, { id: 'record-1' });

    const result = await runServerDomainOperationRaw(mutate, { record });

    expect(result).toEqual({ success: true, data: { id: 'record-1', ref: record } });
    expect(events).toEqual([
      'transaction:start',
      'requirement',
      'pre',
      'resolve:transaction',
      'body',
      'post',
      'transaction:commit',
    ]);
  });

  it('rolls body work back when a postcondition rejects inside the atomic boundary', async () => {
    const { graph, records, state } = createTransactionalRecordFixture();
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          contracts: {
            post: () => createOperationFailure('invalid_revision', 'Revision did not advance.'),
          },
          run: () => records.insert({ id: 'record-1', revision: 1 }).run(),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-rollback' },
    ).mutate;

    await expect(runServerDomainOperationRaw(mutate, {})).resolves.toMatchObject({
      success: false,
      reason: 'invalid_revision',
    });
    expect(state.revisions).toBe(0);
  });

  it('rolls precondition work back when the precondition rejects', async () => {
    const { graph, records, state } = createTransactionalRecordFixture();
    const failure = createOperationFailure('precondition_rejected', 'Precondition rejected.');
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          contracts: {
            pre: () =>
              records.insert({ id: 'record-1', revision: 1 }).run().pipe(Effect.as(failure)),
          },
          run: () => Effect.void,
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-pre-rollback' },
    ).mutate;

    await expect(runServerDomainOperationRaw(mutate, {})).resolves.toMatchObject({
      success: false,
      reason: 'precondition_rejected',
    });
    expect(state.revisions).toBe(0);
  });

  it('rolls body work back when the body fails', async () => {
    const { graph, records, state } = createTransactionalRecordFixture();
    const failure = createOperationFailure('body_failed', 'Body failed.');
    const failBody: Effect.Effect<void, typeof failure> = Effect.fail(failure);
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          run: () =>
            records
              .insert({ id: 'record-1', revision: 1 })
              .run()
              .pipe(Effect.flatMap(() => failBody)),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-body-rollback' },
    ).mutate;

    await expect(runServerDomainOperationRaw(mutate, {})).resolves.toMatchObject({
      success: false,
      reason: 'body_failed',
    });
    expect(state.revisions).toBe(0);
  });

  it('fails before preconditions and body evaluation when local atomicity is unavailable', async () => {
    const pre = vi.fn();
    const body = vi.fn(() => Effect.void);
    const graph = createDataGraphArchitectureAdapter({
      createRuntime: () => createRuntime(<TResult>() => Effect.succeed(undefined as TResult)),
    });
    const mutate = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        mutate: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          contracts: { pre },
          run: body,
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-unavailable' },
    ).mutate;

    await expect(runServerDomainOperationRaw(mutate, {})).resolves.toMatchObject({
      success: false,
      reason: 'execution_unavailable',
    });
    expect(pre).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
  });

  it('reuses an active atomic boundary for nested atomic Operations', async () => {
    const transactions = vi.fn();
    const transactionRuntime = createRuntime(<TResult>() => Effect.succeed(undefined as TResult));
    const parentRuntime = Object.assign(
      createRuntime(<TResult>() => Effect.succeed(undefined as TResult)),
      {
        transaction: <TValue, TError, TRequirements>(
          work: (runtime: Runtime) => Effect.Effect<TValue, TError, TRequirements>,
        ) => {
          transactions();
          return work(transactionRuntime);
        },
      },
    ) satisfies TransactionRuntime;
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      undefined,
      undefined,
      TransactionRuntime
    >({
      createRuntime: () => parentRuntime,
    });
    const inner = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        inner: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          run: () => Effect.succeed('inner'),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-nested' },
    ).inner;
    const outer = defineDomainOperationsForEntity(
      RecordDefinition,
      {
        outer: defineDomainOperation.atomic({
          concerns: [graph.withRuntime()],
          run: () =>
            Effect.promise(() => runServerDomainOperationRaw(inner, {})).pipe(
              Effect.map(result => (result.success ? result.data : 'failed')),
            ),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.atomic-nested' },
    ).outer;

    await expect(runServerDomainOperationRaw(outer, {})).resolves.toEqual({
      success: true,
      data: 'inner',
    });
    expect(transactions).toHaveBeenCalledOnce();
  });
});
