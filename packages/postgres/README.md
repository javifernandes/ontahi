# `@ontahi/postgres`

PostgreSQL-backed runtime capabilities for Ontahi applications.

This package is not a generic SQL client and installing it does not activate one monolithic
adapter. It provides independently composable implementations of Ontahi concerns. Import the Data
Graph storage from `@ontahi/postgres/data-graph`, Task Storage from `@ontahi/postgres/tasks`, and
the durable Event Runtime from `@ontahi/postgres/events`; applications may use any subset with
unrelated implementations for their other runtime concerns.

See the canonical [Relations](../../docs/developers/02-core-concepts/03-relations.md) and
[runtime composition](../../docs/developers/03-runtimes/01-runtime-composition-and-capabilities.md)
chapters for the application-level lifecycle. This README documents provider-specific behavior.

## Data Graph

The host owns its PostgreSQL schema and migrations. When the storage is composed through
`ontahi(...)`, the adapter conventionally maps registered Entities to plural snake-case tables and
snake-case columns, then binds execution and reflected browsing together:

```ts
const defaultStorage = createPostgresDataGraphStorage({
  pool,
});

const application = ontahi({
  storage: defaultStorage,
  entities: [TodoList, Todo, Tag, TodoTag],
});
```

Use `overrides` for focused table or column exceptions without restating conventional mappings.
Explicit `mappings` remain available when the host needs full control or constructs the lower-level
runtime directly.

The runtime supports semantic selections, ordering, limits, counts, streams, projections, nested
relation includes, relation-root reads, inserts, bulk inserts, upserts, updates, deletes, returning
rows and cardinality enforcement.

Local contextual Selections such as `Book.by(...).parts.chapters` execute as correlated `EXISTS`
subqueries without fetching source IDs. Register mappings for every source/target Entity. The
database evaluates membership before final projection/order/limit, and counts ignore result limits.
Direct has-many/belongs-to joins, self-navigation, and single-field-identity many-to-many edges are
supported. Direct joins retain composite target identities; composite many-to-many edge joins and
virtual filter fields are explicitly unsupported. Commands and graph-read protocol v1 remain closed
to this AST: per-hop authority and remote capability negotiation are separate follow-up work.

When constructed with a PostgreSQL `Pool`, the runtime also exposes an optional compositional
transaction capability. Application Operations normally enter it through the contextual graph
facade, so bound execution discovers the runtime associated with one checked-out connection:

```ts
const transition = application.app.graph.transaction(
  Effect.gen(function* () {
    yield* student.course.assign(nextCourse, { ifCurrent: previousCourse }).run();
    yield* updateCourseCapacity.run();
  }),
);
```

The provider-level `runtime.transaction(tx => effect)` contract remains available to adapter and
low-level runtime code. At application level the child UnitOfWork routes bound Queries and explicit
Command `.run()` calls, including normally nested Operations, without exposing `tx`. Success commits
and returns its value. A typed failure or defect rolls back before the connection is released and
restores the parent runtime. The transaction-scoped runtime deliberately omits `transaction`, so
this first contract does not imply nested transactions or savepoints.

Direct `belongsTo/hasMany` Relationship Commands are lowered to one guarded PostgreSQL statement.
Conditional to-one assignment preserves its expected current target atomically:

```ts
student.course.assign(nextCourse, { ifCurrent: previousCourse });
```

A stale target fails without changing the edge. Inverse `remove` likewise retains its named target
as a guard. Portable source/target participant constraints are compiled against the participant's
mapped columns and evaluated while the source and target rows are locked in that same statement.
The first failed constraint is exposed as `relation_constraint_rejected` with its declared stable
rejection descriptor; `unlink` continues to bypass link eligibility so invalid current state can be
repaired.

Ordered `hasMany` Relations map a private order column on the target table. Natural nested and
relation-root reads use that column only when the Query has no explicit `orderBy`. A move locks the
source row and its current members in one transaction, verifies optional before/after neighbors,
and rewrites a dense sequence atomically; concurrent stale moves cannot both commit. Hosts remain
responsible for adding the private column in a migration and assigning new members an append
position. Schema inspection reports a missing order column as `<Source>.<relation>.__order` on the
target Entity table.

Selection-valued many-to-many `link` uses the same contract. PostgreSQL locks the complete selected
participant sets, verifies every row without filtering the affected set, and only then inserts the
Cartesian edge delta. One ineligible participant rejects the whole command without partial edges.
The currently supported provider constraint surface is the portable participant Selection
vocabulary; aggregate and current-population constraints are not yet part of the model.

The same binding provides Explorer-facing free-text search, typed filters, sorting, pagination, and
reporting for mapped columns that are absent from the live table. Applications do not configure a
second reader or repeat the PostgreSQL/in-memory choice. `createPostgresDataGraphRuntime` and
`createPostgresReflectedEntityDataReader` remain available as lower-level building blocks.

The package's conformance suite executes the same behavioral contract against the in-memory
reference runtime and a real ephemeral PostgreSQL instance. A host may pass either a `Pool` or a
query-only, transaction-scoped `PoolClient` to the lower-level runtime. Only a `Pool` advertises the
compositional transaction capability because it can check out and own a connection lifetime.

Migration generation and schema evolution remain host responsibilities.

## Durable Events

`createPostgresEventRuntime({ pool })` retains accepted Event Occurrences and provides stable
correlated subscriptions with leased claims, acknowledgement, release/retry, cancellation, and
recovery after runtime recreation. It also preserves the ordinary process-local live subscription
surface. The adapter advertises durable acceptance, durable delivery, retention, acknowledgement,
subscription ordering, and spill-to-storage overflow. It deliberately does not claim general
replay, deduplication, exactly-once processing, or atomic publication with Data Graph mutations.

```ts
import { createPostgresEventRuntime } from '@ontahi/postgres/events';

const eventRuntime = createPostgresEventRuntime({ pool });
const durable = eventRuntime.durableDelivery!;

await durable.register({
  id: `todo-export:${requestId}`,
  eventId: 'TodoListExportReady',
  eventVersion: 1,
  correlation: { requestId },
});

const claim = await durable.claim(`todo-export:${requestId}`, {
  consumerId: workerId,
  leaseMs: 30_000,
});
if (claim) await durable.acknowledge(claim);
```

The host owns migrations. `createPostgresEventSchemaSql()` returns the bounded table/index contract
for inclusion in a host migration; the runtime never creates or mutates schema at startup. Table
names can be overridden without exposing them in Event declarations. Registration backfills
matching retained occurrences, closing the occurrence-before-subscriber window. A delivery is
claimed by at most one live lease; expiry or explicit release makes the same delivery identity
claimable with an incremented attempt. Acknowledgement prevents later claims. Cancelling a stable
subscription prevents future delivery without deleting its occurrences or already-created
deliveries.

Adapter authors can run `verifyDurableEventRuntimeConformance` from `@ontahi/core/runtime/server`
against another retained implementation. It proves early-occurrence matching, exclusive claim,
identity-preserving retry, acknowledgement, and recovery through runtime recreation.

## Task Storage

`createPostgresTaskStorage({ pool })` persists the private Task source, checkpoint, lifecycle,
progress, runtime reference, result, and semantic execution metadata in one host-owned PostgreSQL
table. Import it independently from `@ontahi/postgres/tasks` and pass it to an executor:

```ts
import { inProcessTasks } from '@ontahi/core/runtime/server';
import { createPostgresTaskStorage } from '@ontahi/postgres/tasks';

const tasks = inProcessTasks({
  storage: createPostgresTaskStorage({ pool }),
});
```

The host applies `createPostgresTaskSchemaSql()` through its migration system. Construction never
creates or changes tables. Interaction responses and Event waits use conditional updates so one
pending continuation has one successful claimant across concurrent processes. Runtime recreation
loads the same private checkpoint; public snapshots and recent-run listings omit the stored input,
and listings omit result payloads.

Task Storage does not execute Tasks, observe database changes, retain JavaScript continuations, or
make Data Graph commands and Event acceptance atomic. Those remain independently composed runtime
concerns even when they share one PostgreSQL pool. Adapter authors can run
`verifyTaskStorageConformance` from `@ontahi/core/runtime/server/tasks` against another storage.

## Data Graph reflection and schema inspection

PostgreSQL storage declares `graphReadCapabilities.relationSelections`, allowing an `ontahi(...)`
application's read dispatcher to negotiate v2 contextual reads with remote clients. Each hop still
requires an explicit `selectionRelations` policy grant and source/target scopes. Discovery executes
no SQL; the authorized membership remains one correlated SQL read. Existing limitations on virtual
filter fields and composite many-to-many edges remain; this does not enable contextual Commands or
observation.

Hosts can validate their bound Entity mappings against a migration-built PostgreSQL database
without starting the application runtime:

```ts
const inspection = await inspectPostgresDataGraphSchemaAtConnection({
  connection: { connectionString: testDatabaseUrl },
  entities: semanticEntities,
});

if (!inspection.ok) throw new Error(JSON.stringify(inspection.issues, null, 2));
```

The first contract reports mapped tables and columns that do not exist. Extra database columns are
allowed because an Entity may intentionally model a projection. Type, constraint, index, policy,
and migration generation remain outside this initial check.
