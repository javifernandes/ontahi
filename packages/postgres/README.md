# `@ontahi/postgres`

Direct PostgreSQL implementation of Ontahi's `DataGraphExecutionRuntime`.

The host owns its PostgreSQL schema and migrations. The adapter requires an explicit mapping between
semantic entities and physical tables:

```ts
const runtime = createPostgresDataGraphRuntime({
  pool,
  mappings: [
    postgresMapping({
      entity: TodoEntity,
      table: 'todos',
      columns: { id: 'id', title: 'title', completed: 'completed' },
    }),
  ],
});
```

The runtime supports semantic selections, ordering, limits, counts, streams, projections, nested
relation includes, relation-root reads, inserts, bulk inserts, upserts, updates, deletes, returning
rows and cardinality enforcement.

`createPostgresReflectedEntityDataReader` provides the same explorer-facing entity-data surface as
the in-memory and Supabase providers: free-text search, typed filters, sorting, pagination, and
reporting for mapped columns that are absent from the live table.

The package's conformance suite executes the same behavioral contract against the in-memory
reference runtime and a real ephemeral PostgreSQL instance. A host may pass either a `Pool` or a
transaction-scoped `PoolClient`, since the adapter only requires the PostgreSQL `query` surface.

Migration generation and schema evolution remain host responsibilities.
