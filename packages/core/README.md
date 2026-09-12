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

## Experimental named Selection factories

For the source-relative counterpart, see [contextual Selection factories](#experimental-contextual-selection-factories).

`withSelectionFactories` adds `by` to an Entity definition and to `defineClientEntity(definition)`.
Apply it after declaring the Entity's identity and locators. This first data-first slice coexists
with legacy `refByX` methods; it does not deprecate them.

```ts
import { entity, field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';

const Customer = withSelectionFactories(
  entity('Customer', { id: field.id(), archivedAt: field.datetime() }),
  {
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    archivedSince: {
      version: 1,
      input: graphSchema.object({ date: field.datetime() }),
      template: { kind: 'predicate', fieldName: 'archivedAt', operator: 'gte', input: 'date' },
    },
  },
);

const explicitMember = Customer.by({ identity: 'c1' });
const archived = Customer.by({ archivedSince: { date: '2026-06-01T00:00:00Z' } });
const portable = archived.toAst(); // No fetch; ordinary Selection AST.
```

Factory names select meanings, not Entity Fields: `date` is an input, not a Customer Field.
Exactly one named alternative is accepted per call; compose resulting Selections with `and`/`or`.
Shorthand is opt-in and must name the sole input. The bounded template forms are a scalar predicate
(`eq`, `lt`, `lte`, `gt`, `gte`) or explicit canonical identity (including composite bindings).
Inputs are required scalar Fields, optionally nullable; optional/nested inputs, callbacks, hidden
time, and external I/O are not supported. Datetime uses the existing JSON-string scalar.

`Customer.selectionFactories` exposes copied, serializable schema/template descriptors, also
available in `application.graph.describe().entities[].selectionFactories`. Each descriptor includes
strict `input`, `output: { kind: 'selection', entityName }`, version, template and optional shorthand.
Output describes membership, not fetched records or guaranteed cardinality. The receiver's ordinary
authorization still applies; discovery is not permission to execute a factory's expanded predicate.
Versions are positive declaration versions owned by the application; no server registry is implied.
`selection.factoryInvocation` retains normalized original input/name/version as authoring metadata.
`toAst`/`toJSON` exclude it; composition and bridge hydration return ordinary Selections and do not
pretend the original invocation describes the entire resulting expression. Source dialects must
retain authored invocations themselves rather than reverse-inferring them from expanded predicates.

Construction does not prove existence or freeze membership. Factories assign no `one`/`many`
cardinality: Operation input schemas and other consumers impose it. An identity template preserves
`references` intent without calling a legacy locator resolver. Expanded predicates and identity
values are validated against the target Entity; the receiver still applies its ordinary policy.
`by` results are unbound Selection values: pass them into an Operation or an explicit runtime/client
read rather than assuming a runtime was attached. Generic in-process Commands can consume composed
Selections, but exact remote update/delete contracts still require their existing Ref targets.

No factory names are auto-generated or reserved for identity; `identity` above is explicitly
declared. A pre-existing legacy locator named `by` conflicts with the new facade method and is
rejected rather than silently overridden. Register the factories once per Entity.

Codegen supports exported `withSelectionFactories(entity({ ... }), { ... })` declarations, including
a local Entity variable and a named object-literal factory map. The generated browser definition and
client facade retain typed `by` and the same descriptors. Factory data must contain literals and
Core `field`/`graphSchema.object` constructors; opaque expressions produce diagnostics, not server
imports. Explorer's Entity Structure panel displays these contracts using its existing schema UI.
Console supports intersected `by` invocations plus an optional `where` predicate in both dialects, with
schema-driven completion. For example, `Tag.by({ named: "Work" }).many()` and
`Tag by named "Work" many` preserve their authored invocation when converting dialect or editing
table ordering/limits. Additional Console factories use `.by(...).by(...)` in TS-like syntax or
`by ... and by ...` in declarative; the Core SDK continues to compose Selection results with
`.and(...)`. Dynamic Explorer invocation forms remain a follow-up.

`expandSelectionFactory(descriptor, argument)` is the shared pure expansion boundary for tools
holding only reflected JSON. It returns validated, normalized `input` and a Selection `expression`;
it neither reads records nor grants authority. As with any client-authored Selection, the receiving
runtime must validate the expression against the actual Entity and apply its ordinary policies.

## Experimental contextual Selection factories

Declare reusable membership relative to a source Selection, using an existing relation:

```ts
import { entity, relation } from '@ontahi/core/runtime/server';

const Book = entity({
  name: 'Book',
  fields: { id: field.id() },
  relations: { contentNodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
  selections: ({ self }) => ({
    parts: self.contentNodes.where(node => node.type.eq('part')),
  }),
});

const selected = Selection.where(Book, book => book.id.eq('my-book')).parts;
// With a named `by` factory attached: Book.by({ slug: 'my-book' }).parts
// With `chapters` declared on ContentNode: selected.chapters
```

These properties live on Selections, not loaded rows. `and`, `or`, `not`, `named` and `where`
retain contextual navigation. A runtime-bound Selection keeps its runtime across hops. Source
read shaping (`limit`, ordering, projection/includes) is rejected instead of silently dropped;
apply it to the target read. Source consumer cardinality is not inherited by a hop.

The declaration is compiled once when used or reflected, after relation targets are resolved.
`contextualSelections` and application graph discovery expose copied source/target contracts and
membership templates. Codegen supports `self.relation` and `self.relation.where(field =>
field.name.eq(literal))` (also `lt/lte/gt/gte`), emitting portable data, never server callbacks.
Unsupported callback expressions produce diagnostics. Self-relation targets retain their declared
contract; this is not unrestricted recursively inferred Entity typing.

`withContextualSelections(entity, callback)` offers the same registration for low-level definitions.
It also accepts portable `{ name: { relationName, expression } }` templates for generated clients.
The explicit low-level counterpart remains available:

```ts
import { contextualSelectionFactory, Selection } from '@ontahi/core/data-graph';

// Book.contentNodes and ContentNode.children are actual declared relations.
const parts = contextualSelectionFactory(Book, 'contentNodes', node => node.type.eq('part'));
const chapters = contextualSelectionFactory(ContentNode, 'children', node =>
  node.type.eq('chapter'),
);
const selected = chapters.from(parts.from(Book.by({ slug: 'my-book' })));
const ast = selected.toAst(); // Portable membership; no read yet.

// Unfiltered navigation uses the same canonical relation-image node.
const allNodes = Selection.all(Book).through('contentNodes');
```

The callback compiles once to a copied, JSON-safe template. `.descriptor` reports the source
context and target Selection contracts. The result is an ordinary Selection supporting `and`,
`or`, `not` and `toQuery()`. Navigation drops the source consumer's one/many requirement; multiple
source members produce a set of target members, not grouped rows or an implicit ordering.

In-memory reads support this membership when `createInMemoryDataGraphRuntime` receives the model
in `entities`. Rehydrate serialized membership with
`graphSchema.selection(ContentNode, { entities: [Book, ContentNode] })`; these are receiver-owned
definitions, not definitions or join metadata supplied by the caller. The schema checks every
source, relation and predicate, with a maximum depth of 32 and 1000 expression nodes.

This is a **read-only experimental slice**. Protocol v1, Supabase, MySQL runtime and Commands
reject relation-image selections explicitly. PostgreSQL supports trusted local reads using registered
mappings and correlated `EXISTS` (stored filter fields and single-identity many-to-many edges).
For unbound Selections, execute `selected.toQuery()`
with a graph read runtime. This does not fetch IDs in the client, create a new identity, or enable
derived-relation writes.

### Opt-in contextual Graph Reads

The low-level receiver supports request/response v2 when its executor supports relation images:

```ts
const dispatch = createGraphReadDispatcher({
  relationSelections: true,
  policies: [
    { ...bookPolicy, selectionRelations: ['contentNodes'] },
    { ...contentNodePolicy, selectionRelations: ['children'] },
  ],
  execute: (read, mode) => executeSupportedGraphRead(read, mode),
});
// Discover graph-read-capabilities first. A v2 receiver reports:
// { orderBy: [...], relationSelections: { version: 2, relations: ['contentNodes'] } }
const request = toGraphReadRequestV2(selected.toQuery(), 'run');
await dispatch(request, { authority });
```

Each hop needs an explicit `selectionRelations` grant on its source policy and registered policies
for source and target. Every source must allow the requested read mode and its caller-supplied
filter operators. Source projection, cardinality and limits do not apply: sources are membership,
not materialized reads. The final target retains normal projection/order/cardinality/limit checks.
View/include permissions (`relations`) do **not** grant membership navigation.

Every source and the final target is intersected with its own authority scope, outside caller
`not`/`or`; scopes are resolved once per Entity per request. Scope definitions remain scalar
Selections in this slice (no recursive relation-image policy expansion). Grants and scopes are
rechecked on every request; discovered capabilities are advisory, not authorization tokens.

`ontahi(...).createGraphReadDispatcher(policies)` uses the storage's provider-owned
`graphReadCapabilities.relationSelections` flag. In-memory and PostgreSQL storage declare this
support; other/custom storage remains closed unless it explicitly implements and declares it.
This enables the protocol, not the relation grants: `selectionRelations` remains required.

`createRemoteDataGraphRuntime` and React graph clients automatically discover the target's v2
capability before each contextual `get`/`run`/`count`, then send the deferred Selection. Metadata
and execution use the same transport options; no capabilities are cached across requests or
authorities. Missing capability fails explicitly, and authorization/execution failures never trigger
v1 fallback or source-ID prefetch. Plain reads and `toGraphReadRequest` stay v1 without extra requests.

Custom `RemoteGraphReadTransport` functions now accept `GraphReadFamilyRequest`, including metadata
requests. Forward all members unchanged, or narrow `request.kind === 'graph-read'` before accessing
`mode`/`selection`. The standard Runtime Transport and legacy HTTP adapters already handle both.
Console navigation and both dialects remain follow-ups. Graph observation rejects contextual reads
until source-change invalidation is supported and verified.

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

Headless host code can execute a semantic Query without assembling the lower-level server Effect
scope:

```ts
const todo = await application.graph.read(
  query(TodoItem)
    .where(item => item.id.eq('todo-1'))
    .one(),
  { scope: 'todo.export' },
);
```

The application pins its own configured graph runtime even when several Ontahí applications share
a process. Plain Queries and Views return arrays; `first`, `one`, `count`, and `exists` terminals
select their corresponding result. Runtime-bound Effects remain the composition API inside
Operations.

## Graph Read ordering capabilities

The `graph.read` Runtime Protocol family also accepts metadata-only discovery:

```json
{ "version": 1, "kind": "graph-read-capabilities", "entityName": "TodoItem" }
```

The dispatcher returns `{ kind: 'graph-read-capabilities-result', entityName: 'TodoItem',
capabilities: { orderBy: ['title'] } }` without invoking a data executor. It uses the same policy,
trusted authority scope validation, and derived-Field dependency checks. Unknown/unexposed Entities
and failed scope resolution return errors without capabilities. Count-only policies report an empty
ordering set. This describes available ordering Fields, not authorization of a particular Query.
`parseGraphReadFamilyRequest` accepts discovery or ordinary reads; `parseGraphReadRequest` and
Graph observation continue to accept data reads only. Standalone Express/Next.js Graph Read
handlers accept discovery as well.

Portable Graph Read requests may opt into `includeCapabilities: true`. After authorization and a
successful execution, the dispatcher adds `capabilities: { orderBy: string[] }` alongside `value`.
The names are root Fields allowed by the same ordering policy checks used to authorize queries,
including derived-Field dependency access. An empty array means no ordering is available (also
the case for count reads); absent metadata means capabilities were not supplied. Observations
support the same opt-in. Requests without it retain their existing response shape, and errors
never carry capabilities.

Both forms are advisory receiver metadata, not client-authored authority or a grant for
future requests. Every subsequent read must still pass ordinary authorization. Consumers can use
`isGraphReadCapabilities` from `@ontahi/core/data-graph` to validate optional response metadata.

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
  *run({ book }) {
    const first = yield* book.resolve();
    const same = yield* book.resolve();

    return { first, same };
  },
});
```

Operation bodies accept direct Effect generator methods as sequencing syntax. `Effect.fn(...)`
and ordinary functions returning an Effect, Command, Selection, or graph read remain supported.
The invoker adapts only actual generator functions; it does not execute arbitrary iterator-shaped
values.

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
