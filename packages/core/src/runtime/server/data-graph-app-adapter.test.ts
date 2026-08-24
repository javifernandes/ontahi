import { Effect, Stream } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  type DataGraphExecutionRuntime,
  type DataGraphTransactionCapability,
  DataGraphTransactionUnavailableError,
  entity,
  field,
  graphSchema,
  type ManyToManyRelationshipCommandExecutionRuntime,
  type RelationshipCommandExecutionRuntime,
} from '../../data-graph/index.js';

import { getRuntimeOperationCacheStore } from './operation/cache.js';

import {
  createDataGraphArchitectureAdapter,
  defineDomainOperation,
  getRequiredDataGraphRuntime,
  getRequiredOperationRuntimeContext,
  getRequiredUnitOfWork,
  layer,
  runServerDomainOperationRaw,
} from './index.js';

describe('data graph architecture adapter', () => {
  const BookDefinition = entity('Book', {
    id: field.id(),
    slug: field.string(),
    title: field.string(),
  });

  const createRuntime = (tenant: string) =>
    ({
      get: vi.fn((_read, _params, options) =>
        Effect.succeed({ id: 'book-1', slug: 'progbook', tenant, authority: options?.authority }),
      ),
      run: vi.fn((_read, _params, options) =>
        Effect.succeed([{ id: 'book-1', tenant, authority: options?.authority }]),
      ),
      count: vi.fn(() => Effect.succeed(1)),
      stream: vi.fn(() => Stream.empty),
      runCommand: vi.fn((command, options) =>
        Effect.succeed({
          operation: command.operation,
          payload: command.payload,
          tenant,
          authority: options?.authority,
        }),
      ),
    }) as DataGraphExecutionRuntime<never, { authority: 'viewer' }, { authority: 'system' }>;

  it('binds graph helpers to the runtime created by the active layer context', async () => {
    const runtimeFactory = vi.fn(runtime => createRuntime(runtime.input.tenant));
    const graph = createDataGraphArchitectureAdapter<
      { tenant: string },
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({
      createRuntime: runtimeFactory,
    });
    const Book = graph.defineEntity(BookDefinition);
    const bookBySlug = graph.namedGraphRead(
      'bookBySlug',
      BookDefinition,
      (params: { slug: string }) => Book.where(book => book.slug.eq(params.slug)),
    );
    const readRuntime = layer('features.books', {
      concerns: [graph.withRuntime<{ tenant: string }>()],
    }).effect('readRuntime', (input: { tenant: string }) =>
      Effect.gen(function* () {
        const rows = yield* Book.where(book => book.slug.eq('progbook')).run({
          authority: 'viewer',
        });
        const named = yield* bookBySlug.get({ slug: 'progbook' }, { authority: 'viewer' });
        const inserted = yield* Book.insertReturning({ slug: 'progbook', title: 'Progbook' }, [
          'id',
        ]).run({ authority: 'system' });

        return { rows, named, inserted, input };
      }),
    );

    await expect(readRuntime({ tenant: 'tenant-a' })).resolves.toEqual({
      input: { tenant: 'tenant-a' },
      inserted: {
        authority: 'system',
        operation: 'insert',
        payload: { slug: 'progbook', title: 'Progbook' },
        tenant: 'tenant-a',
      },
      named: {
        authority: 'viewer',
        id: 'book-1',
        slug: 'progbook',
        tenant: 'tenant-a',
      },
      rows: [{ authority: 'viewer', id: 'book-1', tenant: 'tenant-a' }],
    });
    expect(runtimeFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { tenant: 'tenant-a' },
        scope: 'features.books.readRuntime',
      }),
    );
  });

  it('resolves an input Ref through one authorized graph read per UnitOfWork', async () => {
    const runtime = createRuntime('unit-of-work');
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({ createRuntime: () => runtime });
    const Book = graph.defineEntity(BookDefinition, {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
      },
      domainOperations: {
        inspectRef: defineDomainOperation({
          input: graphSchema.object({ book: field.ref(BookDefinition) }),
          concerns: [graph.withRuntime()],
          run: ({ book }) => {
            expectTypeOf(book.resolve).returns.toEqualTypeOf<
              Effect.Effect<
                { id: string; slug: string; title: string } | null,
                import('./operation/types.js').OperationRuntimeError
              >
            >();
            expectTypeOf(book.invalidate).returns.toEqualTypeOf<void>();

            return Effect.all([book.resolve(), book.resolve()], {
              concurrency: 'unbounded',
            });
          },
        }),
      },
    });

    const result = await runServerDomainOperationRaw(Book.domain.inspectRef, {
      book: Book.ref({ id: 'book-1' }),
    });

    expect(result).toEqual({
      success: true,
      data: [
        {
          authority: undefined,
          id: 'book-1',
          slug: 'progbook',
          tenant: 'unit-of-work',
        },
        {
          authority: undefined,
          id: 'book-1',
          slug: 'progbook',
          tenant: 'unit-of-work',
        },
      ],
    });
    expect(runtime.get).toHaveBeenCalledOnce();
  });

  it('exposes reflected reads from the configured default storage', () => {
    const readEntityData = vi.fn();
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({
      defaultStorage: {
        createRuntime: () => createRuntime('default'),
        readEntityData,
      },
    });

    expect(graph.readEntityData).toBe(readEntityData);
  });

  it('exposes late-bound sibling domain operations to operation closures', () => {
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({
      createRuntime: () => createRuntime('default'),
    });
    let siblingOperation: unknown;
    const Book = graph.defineEntity(BookDefinition, {
      domainOperationDefaults: {
        authority: 'server',
        exposure: 'server-only',
      },
      domainOperations: ({ operations }) => ({
        first: defineDomainOperation({
          run: () =>
            Effect.sync(() => {
              siblingOperation = operations.second;
            }),
        }),
        second: defineDomainOperation({
          run: () => Effect.void,
        }),
      }),
    });

    Effect.runSync(Book.domain.first.run({}) as Effect.Effect<void>);

    expect(siblingOperation).toBe(Book.domain.second);
  });

  it('routes bound graph and Relationship Commands through a transaction child UnitOfWork', async () => {
    const CourseDefinition = entity('Course', {
      id: field.id(),
      availableSeats: field.integer(),
    });
    const StudentDefinition = entity('Student', {
      id: field.id(),
      course: field.ref(CourseDefinition),
    }).manyToMany('courses', CourseDefinition);
    type Runtime = DataGraphExecutionRuntime<never> &
      RelationshipCommandExecutionRuntime &
      ManyToManyRelationshipCommandExecutionRuntime;
    type TransactionRuntime = Runtime & DataGraphTransactionCapability<Runtime>;
    const calls: string[] = [];
    const createExecutionRuntime = (name: string): Runtime => ({
      get: () => Effect.succeed(null),
      run: () => {
        calls.push(`${name}:read`);
        return Effect.succeed([]);
      },
      count: () => Effect.succeed(0),
      stream: () => Stream.empty,
      runCommand: <TResult>() => {
        calls.push(`${name}:command`);
        return Effect.succeed(undefined as TResult);
      },
      runRelationshipCommand: () => {
        calls.push(`${name}:relationship`);
        return Effect.succeed({ added: [], removed: [] });
      },
      runManyToManyRelationshipCommand: () => {
        calls.push(`${name}:many-to-many`);
        return Effect.succeed({ added: [], removed: [] });
      },
    });
    const transactionRuntime = createExecutionRuntime('transaction');
    const parentRuntime: TransactionRuntime = Object.assign(createExecutionRuntime('parent'), {
      transaction: <TResult, TError, TRequirements>(
        work: (runtime: Runtime) => Effect.Effect<TResult, TError, TRequirements>,
      ) => work(transactionRuntime),
    });
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      undefined,
      undefined,
      TransactionRuntime
    >({ createRuntime: () => parentRuntime });
    const Course = graph.defineEntity(CourseDefinition);
    const Student = graph.defineEntity(StudentDefinition);
    const nestedRead = layer('tests.unit-of-work', {
      concerns: [graph.withRuntime()],
    }).effect('nestedRead', () =>
      Effect.gen(function* () {
        yield* Student.all().run();
        return getRequiredUnitOfWork();
      }),
    );
    const transition = layer('tests.unit-of-work', {
      concerns: [graph.withRuntime()],
    }).effect('transition', () =>
      Effect.gen(function* () {
        const parentUnitOfWork = getRequiredUnitOfWork();
        const parentOperationCache = getRuntimeOperationCacheStore(
          getRequiredOperationRuntimeContext().resources,
        );
        const student = Student.ref({ id: 'student-1' });
        const nextCourse = Course.ref({ id: 'course-2' });

        yield* Student.all().run();
        const transactionScope = yield* graph.transaction(
          Effect.gen(function* () {
            const current = getRequiredUnitOfWork();
            expect(getRequiredDataGraphRuntime()).toBe(transactionRuntime);
            yield* Student.all().run();
            yield* Course.insert({ id: 'course-2', availableSeats: 10 }).run();
            yield* student.course.assign(nextCourse).run();
            yield* student.courses.add(nextCourse).run();
            expect(yield* Effect.promise(() => nestedRead())).toBe(current);
            return {
              operationCache: getRuntimeOperationCacheStore(
                getRequiredOperationRuntimeContext().resources,
              ),
              unitOfWork: current,
            };
          }),
        );
        yield* Student.all().run();

        return {
          parentUnitOfWork,
          restoredUnitOfWork: getRequiredUnitOfWork(),
          parentOperationCache,
          transactionScope,
          restoredRuntime: getRequiredDataGraphRuntime(),
        };
      }),
    );

    const result = await transition();

    expect(result.transactionScope.unitOfWork).not.toBe(result.parentUnitOfWork);
    expect(result.transactionScope.operationCache).not.toBe(result.parentOperationCache);
    expect(result.restoredUnitOfWork).toBe(result.parentUnitOfWork);
    expect(result.restoredRuntime).toBe(parentRuntime);
    expect(calls).toEqual([
      'parent:read',
      'transaction:read',
      'transaction:command',
      'transaction:relationship',
      'transaction:many-to-many',
      'transaction:read',
      'parent:read',
    ]);
  });

  it('rejects contextual transactions before evaluating work when capability is absent', async () => {
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      { authority: 'viewer' },
      { authority: 'system' }
    >({
      createRuntime: () => createRuntime('non-transactional'),
    });
    let evaluated = false;
    const attempt = layer('tests.unit-of-work', {
      concerns: [graph.withRuntime()],
    }).effect('unsupportedTransaction', () =>
      graph
        .transaction(
          Effect.sync(() => {
            evaluated = true;
          }),
        )
        .pipe(Effect.either),
    );

    const result = await attempt();

    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(DataGraphTransactionUnavailableError);
    }
    expect(evaluated).toBe(false);
  });

  it('does not require many-to-many capability to run a direct Relationship Command', async () => {
    const CourseDefinition = entity('DirectCourse', { id: field.id() });
    const StudentDefinition = entity('DirectStudent', {
      id: field.id(),
      course: field.ref(CourseDefinition),
    });
    const runRelationshipCommand = vi.fn(() => Effect.succeed({ added: [], removed: [] }));
    const runtime = Object.assign(createRuntime('direct-only'), { runRelationshipCommand });
    const graph = createDataGraphArchitectureAdapter<
      unknown,
      never,
      { authority: 'viewer' },
      { authority: 'system' },
      typeof runtime
    >({ createRuntime: () => runtime });
    const Course = graph.defineEntity(CourseDefinition);
    const Student = graph.defineEntity(StudentDefinition);
    const assign = layer('tests.unit-of-work', {
      concerns: [graph.withRuntime()],
    }).effect('directOnlyRelationship', () =>
      Student.ref({ id: 'student-1' })
        .course.assign(Course.ref({ id: 'course-1' }))
        .run({
          authority: 'system',
        }),
    );

    await assign();

    expect(runRelationshipCommand).toHaveBeenCalledOnce();
  });
});
