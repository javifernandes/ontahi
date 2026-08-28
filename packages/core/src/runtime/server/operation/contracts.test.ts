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
  contract,
  createOperationFailure,
  defineDomainOperation,
  defineDomainOperationsForEntity,
  getCurrentDataGraphRuntime,
  getRequiredUnitOfWork,
  runServerDomainOperationRaw,
  withEffects,
  type UnitOfWork,
} from '../index.js';

const createReadRuntime = () =>
  ({
    get: vi.fn(() => Effect.succeed({ id: 'book-1', title: 'Programming Book' })),
    run: vi.fn(() => Effect.succeed([])),
    count: vi.fn(() => Effect.succeed(0)),
    stream: vi.fn(() => Stream.empty),
    runCommand: vi.fn(() => Effect.succeed(undefined)),
  }) as DataGraphExecutionRuntime<never>;

describe('opaque Domain Operation contract concerns', () => {
  it('runs synchronous, Promise, and Effect checks sequentially around the body', async () => {
    const Book = entity('ContractOrderingBook', {
      id: field.id(),
      title: field.string(),
    });
    const calls: string[] = [];
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          input: graphSchema.object({ book: field.ref(Book) }),
          concerns: [
            contract({
              pre: [
                ({ book }) => {
                  calls.push(`pre:sync:${book.locator.id}`);
                },
                async () => {
                  await Promise.resolve();
                  calls.push('pre:promise');
                },
                () =>
                  Effect.sync(() => {
                    calls.push('pre:effect');
                  }),
              ],
              post: [
                async (_input, result: { title: string }) => {
                  await Promise.resolve();
                  calls.push(`post:promise:${result.title}`);
                },
                () =>
                  Effect.sync(() => {
                    calls.push('post:effect');
                  }),
              ],
            }),
          ],
          run: () =>
            Effect.sync(() => {
              calls.push('body');
              return withEffects({ title: 'Programming Book' }, []);
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.contract-ordering' },
    ).inspect;

    const result = await runServerDomainOperationRaw(inspect, {
      book: createEntityRef(Book, { id: 'book-1' }),
    });

    expect(result).toEqual({
      success: true,
      data: { title: 'Programming Book' },
    });
    expect(calls).toEqual([
      'pre:sync:book-1',
      'pre:promise',
      'pre:effect',
      'body',
      'post:promise:Programming Book',
      'post:effect',
    ]);
  });

  it('returns only the first pre-check failure and does not execute the body effect or post checks', async () => {
    const Book = entity('ContractPreFailureBook', { id: field.id() });
    const bodyEffect = vi.fn();
    const remainingPreCheck = vi.fn();
    const post = vi.fn();
    const first = createOperationFailure('first_precondition', 'The first check rejected.');
    const second = createOperationFailure('second_precondition', 'This must stay hidden.');
    const inspect = defineDomainOperationsForEntity(
      Book,
      {
        inspect: defineDomainOperation({
          concerns: [
            contract({
              pre: [() => [first, second], remainingPreCheck],
              post,
            }),
          ],
          run: () =>
            Effect.sync(() => {
              bodyEffect();
              return { reached: true as const };
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.contract-pre-failure' },
    ).inspect;

    const result = await runServerDomainOperationRaw(inspect, {});

    expect(result).toEqual({
      success: false,
      reason: 'first_precondition',
      message: 'The first check rejected.',
      error: 'The first check rejected.',
      errorType: 'first_precondition',
    });
    expect(bodyEffect).not.toHaveBeenCalled();
    expect(remainingPreCheck).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a post-check failure after preserving an already-applied body mutation', async () => {
    const Book = entity('ContractPostFailureBook', { id: field.id() });
    const state = { mutations: 0 };
    const first = createOperationFailure('first_postcondition', 'The first post-check rejected.');
    const second = createOperationFailure('second_postcondition', 'This must stay hidden.');
    const mutate = defineDomainOperationsForEntity(
      Book,
      {
        mutate: defineDomainOperation({
          concerns: [
            contract({
              post: () => [first, second],
            }),
          ],
          run: () =>
            Effect.sync(() => {
              state.mutations += 1;
              return { mutations: state.mutations };
            }),
        }),
      },
      { exposure: 'server-only', layer: 'tests.operation.contract-post-failure' },
    ).mutate;

    const result = await runServerDomainOperationRaw(mutate, {});

    expect(result).toEqual({
      success: false,
      reason: 'first_postcondition',
      message: 'The first post-check rejected.',
      error: 'The first post-check rejected.',
      errorType: 'first_postcondition',
    });
    expect(state.mutations).toBe(1);
  });

  it('keeps callback input portable while the body receives a hydrated Ref in one UnitOfWork', async () => {
    const BookDefinition = entity('ContractHydratedBook', {
      id: field.id(),
      title: field.string(),
    });
    const runtime = createReadRuntime();
    const graph = createDataGraphArchitectureAdapter({ createRuntime: () => runtime });
    let preUnitOfWork: UnitOfWork | undefined;
    let bodyUnitOfWork: UnitOfWork | undefined;
    let postUnitOfWork: UnitOfWork | undefined;
    let preRuntimeResources: Map<string, unknown> | undefined;
    let postRuntimeResources: Map<string, unknown> | undefined;
    let preDataGraphRuntime: unknown;
    let bodyDataGraphRuntime: unknown;
    let postDataGraphRuntime: unknown;
    const observedMethods: Array<readonly [string, string, string]> = [];
    const Book = graph.defineEntity(BookDefinition, {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
      },
      domainOperations: {
        inspect: defineDomainOperation({
          input: graphSchema.object({ book: field.ref(BookDefinition) }),
          concerns: [
            graph.withRuntime(),
            contract({
              pre: ({ book }, contractRuntime) => {
                preUnitOfWork = getRequiredUnitOfWork();
                preRuntimeResources = contractRuntime.resources;
                preDataGraphRuntime = getCurrentDataGraphRuntime();
                const portableBook = book as {
                  resolve?: unknown;
                  invalidate?: unknown;
                  refresh?: unknown;
                };
                observedMethods.push([
                  typeof portableBook.resolve,
                  typeof portableBook.invalidate,
                  typeof portableBook.refresh,
                ]);
                contractRuntime.resources.set('contract-marker', 'pre');
              },
              post: ({ book }, result, contractRuntime) => {
                postUnitOfWork = getRequiredUnitOfWork();
                postRuntimeResources = contractRuntime.resources;
                postDataGraphRuntime = getCurrentDataGraphRuntime();
                const portableBook = book as {
                  resolve?: unknown;
                  invalidate?: unknown;
                  refresh?: unknown;
                };
                observedMethods.push([
                  typeof portableBook.resolve,
                  typeof portableBook.invalidate,
                  typeof portableBook.refresh,
                ]);
                expect(result).toEqual({ title: 'Programming Book' });
              },
            }),
          ],
          run: ({ book }) => {
            expectTypeOf(book).toHaveProperty('resolve');
            expectTypeOf(book).toHaveProperty('invalidate');
            expectTypeOf(book).toHaveProperty('refresh');
            return Effect.gen(function* () {
              bodyUnitOfWork = getRequiredUnitOfWork();
              bodyDataGraphRuntime = getCurrentDataGraphRuntime();
              observedMethods.push([
                typeof book.resolve,
                typeof book.invalidate,
                typeof book.refresh,
              ]);
              expect(bodyUnitOfWork.resources.get('contract-marker')).toBe('pre');
              const resolved = yield* book.resolve();
              return { title: resolved?.title ?? 'missing' };
            });
          },
        }),
      },
    });

    const result = await runServerDomainOperationRaw(Book.domain.inspect, {
      book: Book.ref({ id: 'book-1' }),
    });

    expect(result).toEqual({ success: true, data: { title: 'Programming Book' } });
    expect(observedMethods).toEqual([
      ['undefined', 'undefined', 'undefined'],
      ['function', 'function', 'function'],
      ['undefined', 'undefined', 'undefined'],
    ]);
    expect(bodyUnitOfWork).toBe(preUnitOfWork);
    expect(postUnitOfWork).toBe(preUnitOfWork);
    expect(postRuntimeResources).toBe(preRuntimeResources);
    expect(preDataGraphRuntime).toBeUndefined();
    expect(bodyDataGraphRuntime).toBe(runtime);
    expect(postDataGraphRuntime).toBe(runtime);
    expect(runtime.get).toHaveBeenCalledOnce();
  });

  it('commits an explicit graph transaction before post checks run in the parent UnitOfWork', async () => {
    type Runtime = DataGraphExecutionRuntime<never>;
    type TransactionRuntime = Runtime & DataGraphTransactionCapability<Runtime>;
    const events: string[] = [];
    const state = { committed: false, mutations: 0 };
    const createRuntime = (): Runtime => ({
      get: () => Effect.succeed(null),
      run: () => Effect.succeed([]),
      count: () => Effect.succeed(0),
      stream: () => Stream.empty,
      runCommand: <TResult>() => Effect.succeed(undefined as TResult),
    });
    const transactionRuntime = createRuntime();
    const parentRuntime = Object.assign(createRuntime(), {
      transaction: <TValue, TError, TRequirements>(
        work: (runtime: Runtime) => Effect.Effect<TValue, TError, TRequirements>,
      ) =>
        Effect.gen(function* () {
          events.push('transaction:start');
          const value = yield* work(transactionRuntime);
          state.committed = true;
          events.push('transaction:commit');
          return value;
        }),
    }) as TransactionRuntime;
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      undefined,
      undefined,
      TransactionRuntime
    >({ createRuntime: () => parentRuntime });
    let parentUnitOfWork: UnitOfWork | undefined;
    let bodyUnitOfWork: UnitOfWork | undefined;
    let postUnitOfWork: UnitOfWork | undefined;
    const RecordDefinition = entity('ContractTransactionalRecord', { id: field.id() });
    const RecordEntity = graph.defineEntity(RecordDefinition, {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
      },
      domainOperations: {
        mutate: defineDomainOperation({
          concerns: [
            graph.withRuntime(),
            contract({
              pre: () => {
                parentUnitOfWork = getRequiredUnitOfWork();
                events.push('pre');
              },
              post: () => {
                postUnitOfWork = getRequiredUnitOfWork();
                events.push('post');
                expect(state.committed).toBe(true);
                return createOperationFailure(
                  'transactional_postcondition',
                  'The committed result failed its post-check.',
                );
              },
            }),
          ],
          run: () =>
            graph.transaction(
              Effect.sync(() => {
                bodyUnitOfWork = getRequiredUnitOfWork();
                state.mutations += 1;
                events.push('body');
                return { mutations: state.mutations };
              }),
            ) as Effect.Effect<{ mutations: number }, never>,
        }),
      },
    });

    const result = await runServerDomainOperationRaw(RecordEntity.domain.mutate, {});

    expect(result).toEqual({
      success: false,
      reason: 'transactional_postcondition',
      message: 'The committed result failed its post-check.',
      error: 'The committed result failed its post-check.',
      errorType: 'transactional_postcondition',
    });
    expect(events).toEqual(['pre', 'transaction:start', 'body', 'transaction:commit', 'post']);
    expect(state).toEqual({ committed: true, mutations: 1 });
    expect(bodyUnitOfWork).not.toBe(parentUnitOfWork);
    expect(postUnitOfWork).toBe(parentUnitOfWork);
  });
});
