# `@ontahi/postgres`

Direct PostgreSQL storage for Ontahi applications.

See the canonical [Relations](../../docs/developers/02-core-concepts/03-relations.md) and
[runtime composition](../../docs/developers/03-runtimes/01-runtime-composition-and-capabilities.md)
chapters for the application-level lifecycle. This README documents provider-specific behavior.

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
