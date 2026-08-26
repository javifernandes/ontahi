# Ontahi Core

`@ontahi/core` contains Ontahi's technology-independent graph, operation, task, runtime, computation, and value primitives.

It also contains the zero-infrastructure in-memory graph and task-run implementations used by local hosts, examples, and tests.

The package is source-independent from every host application and is published as a validated
registry artifact with the rest of the lockstep `@ontahi/*` package set.

Current docs:

1. [Ontahí for Developers](../../docs/developers/README.md) - canonical application-model guide
2. [Historical Core Mental Model](./docs/current-mental-model.md) - computational and layer vocabulary retained from Ontahi's early architecture
3. [Boundary Schemas](./docs/boundary-schemas.md) - graph-native operation contracts and the narrower role of transport validation adapters
4. [Entity Lifecycle Modules](./docs/entity-lifecycle.md) - current house style for richer domain areas that need entity folders, policy modules, lifecycle transitions, and explicit event outputs
5. [Application Data Access](../../docs/application-data-access.md) - end-to-end Query, View,
   policy, React, and Operation authoring across the public packages

## Application composition

`ontahi(...)` is the application composition root for new applications. It binds storage, optional
task execution, and semantic entities into the runtime and reflected graph consumed by ingress
adapters and Explorer:

```ts
const application = ontahi({
  storage,
  tasks: inProcessTasks(),
  entities: [TodoList, TodoItem],
});
```

The configured storage remains available as `application.storage`. Provider-specific capabilities
stay typed: in-memory applications expose their dataset for test setup, while persistent providers
do not pretend to offer an in-process dataset.

## Caller-owned Views

An Operation may define a semantic population by returning a declarative Selection while each
client chooses its materialized shape:

```ts
import { Trip } from './generated/client-entities.js';

const TripList = Trip.view('TripList', {
  id: true,
  driver: { name: true },
});

const operation = Trip.domain.available.as(TripList);
```

The View is client source, not a server graph registration. `.as(view)` transports its versioned
JSON-safe AST; the server validates it against the Operation's Selection output Entity and combines
population plus shape into one final Query. View names are document identity and do not share the
server application's Entity/Value namespace.

## Authentication Principal

Hosts authenticate their native request and enter Ontahi with a provider-neutral Principal. The
runtime scope works the same way without HTTP:

```ts
await application.app.runtime.withInvocationContext({ principal }, () =>
  TodoItem.complete({ todos: ['todo-123'] }),
);
```

Operations can declare `requires: [app.require.authenticated()]`; their implementation can read
`app.auth.currentPrincipal()` or yield `app.auth.requirePrincipal()`. `null` means unauthenticated.
Provider sessions, OAuth tokens, claims, and user profiles remain host resources rather than part
of the canonical Principal.

## In-Memory Graph

`createInMemoryDataGraphStorage` is the recommended application binding. It supplies both the full
`DataGraphExecutionRuntime` surface and reflected entity browsing over one live seeded dataset, so
the application configures its default storage once:

```ts
const storage = createInMemoryDataGraphStorage();

const application = ontahi({
  storage,
  entities: [TodoList, TodoItem],
});
```

Queries, relation-root reads, streams, counts, inserts, bulk inserts, upserts, updates, deletes, and
Explorer reads all observe that same state. `createInMemoryDataGraphRuntime` and
`createInMemoryReflectedEntityDataReader` remain available as lower-level building blocks.

The implementation is intentionally process-local. It provides no restart durability, indexes,
migrations, or database constraints; production adapters own those guarantees. Core defines an
optional `DataGraphTransactionCapability`, but the in-memory reference runtime does not advertise
it. Sequencing its Effects therefore does not imply shared rollback.

## UnitOfWork and contextual transactions

Every top-level server Operation has a UnitOfWork backed by its runtime resources. Normally nested
Operations reuse that identity. The lower-level `application.app.runtime.unitOfWork.current()` and
`.required()` facades expose the scope without turning it into a database transaction or a
cross-request cache.

Resolved input Refs also use that boundary. A Ref declared directly in the input schema resolves
through the active Data Graph Query runtime, so existing graph-read policy remains the
authorization owner. Repeated explicit `resolve()` calls for the same normalized Ref and resolver
share one in-flight or completed read inside the UnitOfWork:

```ts
const inspectBook = app.operation.define({
  input: graphSchema.object({ book: field.ref(Book) }),
  run: ({ book }) =>
    Effect.gen(function* () {
      const first = yield* book.resolve();
      const same = yield* book.resolve();

      return { first, same };
    }),
});
```

Different resolver declarations and execution identities (`principal` plus `cacheScope`) stay
isolated representations of the same Ref. Operation code can explicitly evict all of them with
`book.invalidate()`, or use `book.refresh()` to evict and immediately reload. This slice does not
infer automatic invalidation from arbitrary Commands. Separate top-level Operations and transaction
child UnitOfWorks never share resolved values.

Providers may advertise the optional `DataGraphTransactionCapability`. Application code can use
the contextual facade inside an Operation:

```ts
const transition = Effect.gen(function* () {
  yield* application.app.graph.transaction(
    Effect.gen(function* () {
      yield* student.course.assign(nextCourse, { ifCurrent: previousCourse }).run();
      yield* updateCourseCapacity.run();
    }),
  );
});
```

The transaction creates an isolated child UnitOfWork and binds the provider's transaction runtime
there. Bound reads, Graph Commands, direct Relationship Commands, and many-to-many Relationship
Commands resolve it lazily; normally nested Operations remain inside the same boundary. The parent
scope is restored after success, typed failure, or defect. Transaction children use a fresh
Operation-result cache so a rolled-back observation is not published into the parent UnitOfWork.

`.run()` remains explicit because creating a Command is pure and portable. A runtime-bound
Relationship Command adds `.run()` non-enumerably, so its canonical serialized shape does not gain
callbacks or authority-dependent metadata. If the active runtime does not advertise compositional
transactions, the effect fails with `DataGraphTransactionUnavailableError` before evaluating its
work.

## Applied Relationship outcomes and Reactions

An application may register declarative Reactions separately from Relation metadata. The factories
derive the canonical relation identity from either endpoint and keep delivery policy visible:

```ts
import { reaction } from '@ontahi/core/data-graph';

const application = ontahi({
  storage,
  entities: [Course, Student],
  reactions: () => [
    reaction
      .relationship(Course, 'students')
      .removed({ id: 'course.students.removed', delivery: 'inline' })
      .react(outcome => [
        reaction.intent.invoke('Course.recordRemoval', {
          studentId: outcome.command.source.locator.id,
        }),
        reaction.intent.emit({
          type: 'StudentRemovedFromCourse',
          student: outcome.command.source,
          course: outcome.command.target,
        }),
      ]),
  ],
});
```

The thunk form is useful when circular Entity declarations defer Relation resolution. Ontahi
evaluates it once after resolving the application Entity registry, validates unique non-empty
Reaction ids, and stores the canonical matchers. A static array is also accepted.

Provider runtimes return an explicit Relationship Command result. An applied command carries its
exact delta, including an idempotent empty delta; a conditional command may instead report that it
was not applied:

```ts
const result =
  yield *
  student.course.assign(nextCourse, { ifCurrent: previousCourse, onMismatch: 'skip' }).run();

if (result.status === 'not-applied') {
  result.diagnostic.reason; // 'relationship_precondition_failed'
}
```

Omitting `onMismatch` (or setting it to `fail`) preserves the typed failure channel. Constraint and
precondition diagnostics remain JSON-safe through remote execution; they expose structural
Relation identity and declared safe rejection parameters, not the actual current target.

Application-bound execution enriches only applied results with mutation and Reaction evidence:

```ts
const result =
  yield *
  application.graph.entities.Course.refById('course-1')
    .students.remove(application.graph.entities.Student.refById('student-1'))
    .run();

result.status; // 'applied'
result.outcome.command;
result.outcome.delta;
result.reactions;
```

A skipped application-bound command returns `{ status: 'not-applied', diagnostic }`, creates no
Applied Mutation Outcome, and runs no Reactions.

`reaction.intent.execute(...)`, `.invoke(...)`, and `.emit(...)` express follow-up Commands,
Operation Invocations, and Events without embedding an arbitrary effect callback in Relation
metadata. A failed follow-up is recorded in `result.reactions`; it does not rewrite the already
applied parent as failed. `inline` and `best-effort` make immediate attempts. Durable acceptance
still requires a dedicated runtime capability and does not imply exactly-once execution.

Required coordinated changes remain explicit inside an Operation and
`application.app.graph.transaction(...)`. When a Relationship Command runs in that transaction,
Ontahi queues its Reactions: they are absent from the result inside the transaction callback, run
only after the provider confirms commit, and are visible before the outer transaction Effect
returns. Rollback discards the queue. Follow-up Commands then resolve the restored parent runtime,
not the released transaction runtime.
