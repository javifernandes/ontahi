# `@ontahi/postgres`

PostgreSQL-backed runtime capabilities for Ontahi applications.

This package is not a generic SQL client and installing it does not activate one monolithic
adapter. It provides independently composable implementations of Ontahi concerns. Import the Data
Graph storage from `@ontahi/postgres/data-graph`, Task Storage from `@ontahi/postgres/tasks`, and
the durable Event Runtime from `@ontahi/postgres/events`; the Data Graph storage also provides
replicated collection persistence through the same pool. Applications may use any subset with
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

### Replicated collections

`createPostgresDataGraphStorage({ pool })` exposes the replicated collection CAS capability from the
same active Entity storage. The acceptance runner stores internal accepted snapshots and a
store-owned revision in `ontahi_replicated_collections`; these rows are not addressable Entities and
do not acquire domain relations, operations, or public query semantics.

The host applies `createPostgresReplicatedCollectionSchemaSql()` through its migration system:

```ts
import { createReplicatedCollectionAcceptanceRunner } from '@ontahi/core';
import {
  createPostgresDataGraphStorage,
  createPostgresReplicatedCollectionSchemaSql,
} from '@ontahi/postgres';

for (const statement of createPostgresReplicatedCollectionSchemaSql()) {
  await pool.query(statement);
}

const storage = createPostgresDataGraphStorage({ pool });
const runner = createReplicatedCollectionAcceptanceRunner(observer, {
  activeStorage: storage,
  collectionId: 'repository-evidence',
});
```

Acceptance uses a conditional revision update or conflict-safe first insert. A delayed process
receives the winning stored snapshot instead of replacing it. Construction never creates or alters
the internal table, and `replicatedCollections.tables.snapshots` can override its name. A custom
replica adapter remains available at runner composition when an application intentionally keeps
replicas outside its Entity storage.

## Durable Events

`createPostgresEventRuntime({ pool })` retains accepted Event Occurrences and provides stable
correlated subscriptions with leased claims, acknowledgement, release/retry, cancellation, and
recovery after runtime recreation. It also preserves the ordinary process-local live subscription
surface. The adapter advertises durable acceptance, durable delivery, bounded delivery inspection,
retention, acknowledgement, subscription ordering, and spill-to-storage overflow. It deliberately does not claim general
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

const failed = await eventRuntime.deliveryInspection!.inspect(`todo-export:${requestId}`, {
  limit: 20,
  states: ['failed'],
});
```

The host owns migrations. `createPostgresEventSchemaSql()` returns the bounded table/index contract
for inclusion in a host migration; the runtime never creates or mutates schema at startup. Table
names can be overridden without exposing them in Event declarations. Registration backfills
matching retained occurrences, closing the occurrence-before-subscriber window. A delivery is
claimed by at most one live lease; expiry or explicit release makes the same delivery identity
claimable with an incremented attempt. Acknowledgement prevents later claims. Cancelling a stable
subscription prevents future delivery without deleting its occurrences or already-created
deliveries. Inspection reads only the current retained lifecycle state and excludes payload,
correlation, causation, claim identity, and worker identity; it does not retain attempt history or
grant client access by itself.

Hosts upgrading an existing Event schema must add the inspection-order index through their migration
system, for example
`CREATE INDEX ontahi_event_deliveries_inspection_idx ON ontahi_event_deliveries (subscription_id, created_at, delivery_id)`
when using the default table name. Schema generation includes it for new installations.

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

The host applies `createPostgresTaskSchemaSql()` through its migration system. Reapply the updated statements to existing Task tables before using durable trace correlation. Construction never
creates or changes tables. The schema adds the admission columns and partial unique index to
existing Task tables. Apply it before upgrading the adapter. The index arbitrates concurrent
starts for `reuse-running` and `skip-if-completed` across workers. Interaction responses and Event waits use conditional updates so one
pending continuation has one successful claimant across concurrent processes. Runtime recreation
loads the same private checkpoint; public snapshots and recent-run listings omit the stored input,
and listings omit result payloads. `listBySubject` provides the same bounded exact-subject discovery
contract as the in-memory reference storage, with optional lifecycle-status filtering.

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

### Run explicit Tasks in a PostgreSQL worker

The application accepts runs with `inProcessTasks({ storage, deferExplicitExecution: true })`.
Use PostgreSQL Task Storage on both sides. In the worker process, register the same explicit Task
definitions and poll with `createPostgresTaskWorker({ pool, tasks }).runOnce(signal)`.
`runOnce` returns the claimed run identity after a terminal state or a persisted wait, and returns
`undefined` when it finds no work. The host controls polling delay and shutdown.

Use a direct or session-pooled PostgreSQL connection. The worker claims a run with a database
lease and checks the lease before starting a step or writing a checkpoint. Another worker can
recover the last checkpoint after the lease expires, even if the earlier session is still open.
Set `leaseMs` to cover the longest execution from claim to its final checkpoint or wait write,
including provider calls. The fixed deadline defaults to 60 seconds and does not renew during execution. External writes still need provider idempotency or reconciliation
if a worker loses its lease while a remote call is in flight.

A trusted host can call `worker.cancel(ref)` for a queued, waiting, or running deferred run.
Cancelling a running run revokes its lease and preserves the checkpoint as a potentially
ambiguous external outcome. Matching admission requests return `reconciliation-required`.
Cancellation prevents stale checkpoint writes. An external request already sent can still
finish at the provider.

For Event waits, pass `events: { declarations, tables }` to `createPostgresTaskWorker` and apply
the PostgreSQL Event schema for those tables. Publish through the same Event tables. The worker
persists the wait and releases its Task claim. Future polls can attach a retained occurrence,
including one published while the worker was offline. The Task claims its continuation before
acknowledging the Event delivery.

Task observation streams use a PostgreSQL journal for deferred runs. Apply the updated Task
schema so workers can record each snapshot atomically with the run update. Observers receive the
current snapshot and poll for subsequent updates, including intermediate transitions committed
between polls. The journal retains the latest 256 snapshots per run. Set
`observationPollMs` on the server's Task Storage to change the default 100 ms interval.
