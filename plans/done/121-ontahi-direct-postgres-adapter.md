# 121. Ontahi Direct PostgreSQL Adapter

Status: done

Canonical ID: `ontahi://plans/121-ontahi-direct-postgres-adapter`

Migrated from: `bookops://plans/121-ontahi-direct-postgres-adapter`
Original path: `plans/done/121-ontahi-direct-postgres-adapter.md`
Source commit: `4d753339`

## Summary

Add a direct PostgreSQL implementation of Ontahi's data graph execution runtime and exercise it in
the independent Todo application. This validates that an Ontahi host can choose standard local
persistence without Supabase while preserving the same semantic query and command API.

## Context

The portability example proved the framework can host a second application, but its reference
persistence remained process-local. The next extraction risk is a real database adapter. PostgreSQL
must be tested as PostgreSQL: replacing it with SQLite would hide dialect, transaction, constraint,
type, and `RETURNING` behavior.

For this slice, the host owns physical schema evolution. Ontahi executes semantic graph operations;
the programmer explicitly maps entities and fields and provides migrations.

## Scope

- `@ontahi/postgres` with explicit entity/table/column mappings.
- Parameterized SQL for the current `DataGraphExecutionRuntime` query and command surface.
- Mapping validation at runtime construction.
- Reflected entity-data reads with search, typed filters, sorting, pagination, and physical-drift
  reporting.
- A shared behavioral conformance suite executed against in-memory and PostgreSQL runtimes.
- Unit tests for SQL compilation and integration tests against PostgreSQL via Testcontainers.
- Optional PostgreSQL storage for the Todo example with a host-owned Docker Compose service and SQL
  migration.
- Client selection-input ergonomics discovered while validating the Todo UI: IDs and entity records
  normalize to refs through the default identity before transport.
- CI wiring for the new package.

## Non-Goals

- Automatic migration generation or semantic-model diffing.
- Task storage.
- A provider-owned transaction DSL; hosts may supply a transaction-scoped PostgreSQL client.
- Replacing the existing in-memory default.
- Folding PostgreSQL into the resource/binding design from plan 120.

## Proposed Form

```ts
createPostgresDataGraphRuntime({
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

The provider executes; the programmer declares the mapping and governs physical evolution.

## Acceptance Checklist

- [x] Direct PostgreSQL runtime executes reads, counts, streams, inserts, bulk inserts, upserts,
      updates, deletes, and returning rows.
- [x] Projections, nested relation includes, and relation-root reads match the in-memory runtime.
- [x] Read and command cardinality failures are typed and do not partially mutate state.
- [x] Every existing scalar selection operator, boolean composition, empty membership, multi-field
      ordering, null placement, and count/limit semantics match the in-memory runtime.
- [x] Reflected entity-data reads match the existing in-memory/Supabase surface and report mapped
      columns missing from the live PostgreSQL table.
- [x] SQL values are parameterized and physical identifiers come only from validated host mappings.
- [x] Integration tests run against a real ephemeral PostgreSQL instance.
- [x] One parametrized conformance suite runs the same cases against in-memory and PostgreSQL
      runtimes.
- [x] Todo can select PostgreSQL through host configuration while retaining in-memory storage by
      default.
- [x] Todo owns its Docker Compose service and manual migration.
- [x] React callers can pass explicit Todo IDs or complete Todo records without manually constructing
      refs or a Selection.
- [x] Ergonomic client inputs still transport canonical Selection refs and preserve
      `Selection<TEntity>` in server handlers.
- [x] Schema-aware React input inference remains additive and preserves existing generated BookOps
      operation inputs and entity-ref call sites.
- [x] New package participates in workspace build, typecheck, lint, tests, and CI change detection.
- [x] Manually verify Todo operations against the Docker Compose PostgreSQL service, including
      persistence across an Express process restart.

## Verification

- `pnpm --filter @ontahi/postgres run typecheck`
- `pnpm --filter @ontahi/postgres run test:unit`
- `pnpm --filter @ontahi/postgres run test:integration`
- `pnpm --filter @ontahi/example-todo-express run typecheck`
- `pnpm --filter @ontahi/example-todo-express run test`
- actionlint for `.github/workflows/ci.yml`

## Decisions

1. Testcontainers owns ephemeral integration databases; Docker Compose is for the runnable example.
2. One container is shared by the integration suite and tables are truncated between tests.
3. Mappings and migrations are deliberately host-owned.
4. Testcontainers owns the PostgreSQL lifecycle while each case resets physical tables.
5. The adapter accepts the minimal `query` surface, allowing a host to provide either a pool or a
   transaction-scoped client.
6. Scalar selection inputs are exposed only when the entity has one statically known locator;
   records and explicit refs remain safe for richer locator sets until identity names are preserved
   more precisely in the entity type.

## Closure / Evolution

The next persistence priority is a PostgreSQL task-run store in a separate PR. Later lines may add
model-driven migration proposals, drift detection, or integration with environment
resources/bindings.
