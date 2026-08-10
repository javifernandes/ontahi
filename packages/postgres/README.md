# `@ontahi/postgres`

Direct PostgreSQL storage for Ontahi applications.

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

The same binding provides Explorer-facing free-text search, typed filters, sorting, pagination, and
reporting for mapped columns that are absent from the live table. Applications do not configure a
second reader or repeat the PostgreSQL/in-memory choice. `createPostgresDataGraphRuntime` and
`createPostgresReflectedEntityDataReader` remain available as lower-level building blocks.

The package's conformance suite executes the same behavioral contract against the in-memory
reference runtime and a real ephemeral PostgreSQL instance. A host may pass either a `Pool` or a
transaction-scoped `PoolClient`, since the adapter only requires the PostgreSQL `query` surface.

Migration generation and schema evolution remain host responsibilities.
