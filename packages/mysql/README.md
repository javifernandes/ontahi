# @ontahi/mysql

MySQL storage for Ontahi, tested with MySQL 8.4 and InnoDB. It uses `mysql2/promise` and the
shared `@ontahi/sql` read implementation. This release does not claim full PostgreSQL parity.

```ts
import { createPool } from 'mysql2/promise';
import { createMysqlDataGraphStorage } from '@ontahi/mysql';
import { ontahi } from '@ontahi/core/runtime/server';

const pool = createPool(process.env.DATABASE_URL!);
const application = ontahi({
  storage: createMysqlDataGraphStorage({ pool }),
  entities: [TodoList, TodoItem],
});
```

The host installs `mysql2` when importing it directly and owns the pool lifecycle, credentials,
physical schema, migrations, and grants. Keep the pool alive for the application lifetime and close
it on host shutdown.

## Public entrypoints

The package root and `/data-graph` export `createMysqlDataGraphStorage`,
`createMysqlDataGraphRuntime`, `mysqlMapping`, `mysqlNaming`, `inferMysqlMappings`, query/selection
compilers, reflection readers, and `MysqlDataGraphError`.

Storage infers plural snake-case tables and snake-case columns using the same conventions as
PostgreSQL. Use `overrides` for physical exceptions, or pass explicit `mappings`. Standalone runtime
construction requires mappings and a promise pool exposing `execute` and `getConnection`.

## Supported behavior

- Scalar Selections, reference lowering/lifting, aliases, nested projections and relation reads,
  related-root reads, ordering, count, and stream from one buffered query execution.
- Derived-field projections, predicates, and ordering, including correlated relation counts.
- Contextual Selections such as `Book.parts.chapters`, using the shared SQL correlated-`EXISTS`
  compiler without source-ID prefetch. Nested/self navigation, direct and many-to-many membership,
  Boolean composition, projections, count and exact-one checks operate on final target membership.
  Storage advertises Graph Read v2 support; application policies must grant each
  `selectionRelations` hop and scope each participating Entity independently.
- Insert, bulk insert, update (including primary keys), delete, returning stored fields, and Entity Mutation deltas.
- Upsert with explicit unique conflict targets and merge/ignore semantics.
- Direct Relationship Commands with participant eligibility, conditional replacement, exact deltas,
  and destination-serialized count constraints.
- Many-to-many additions/removals with endpoint selections, eligibility checks, and exact edge deltas.
- Ordered Relationship Commands with position preconditions and exact move deltas.
- Compositional transactions, with one connection and no public nested transaction capability.
- Command savepoints: catching a failed command inside a transaction cannot commit earlier rows
  from that command. Work on a transaction runtime is serialized, and in-flight SQL completes before
  the connection can be released on interruption.
- Reflected Entity data with search, filters, sorting, pagination, and missing-column reporting.

Mutations require an InnoDB table and a fully mapped physical primary key. The adapter selects and
locks update/delete membership once, then addresses those primary keys. Results are read from the
same connection; generated insert identifiers are recovered one row at a time. Returned defaults
come from the database. Triggers that rewrite primary keys are outside this contract.

Use a case-sensitive, NO PAD collation such as `utf8mb4_0900_bin` for string equality consistent
with the tested model. Other collations deliberately change comparisons. Boolean values are
normalized from MySQL `0`/`1` according to Entity fields. Date/time, JSON, and large numeric physical
representations are not yet covered by provider conformance; configure and validate these explicitly
before depending on them.

## Explicit limitations

Contextual membership is read-only: protocol v1 and Commands remain closed. Direct joins preserve
composite target identities; many-to-many contextual joins require single-field endpoint identities
and matching receiver-owned edge mappings. Virtual filter fields remain unsupported in contextual
membership. Supabase/PostgREST support is separate from this direct-SQL implementation.

Upsert requires a full physical unique index matching `conflictOn`. A collision on another unique
key fails and rolls back the command. It does not use broad `INSERT IGNORE` or let MySQL choose an
unrelated conflict target. An ignored row produces no returned row, so exact-one cardinality rejects
an ignored-only command.

Many-to-many relations require single-field endpoint identities and a unique index on the mapped
edge pair. Ordered moves require a mapped integer order column and a required inverse Reference
Field. The host supplies the append policy for newly inserted members; see the Todo migration.

Transactions use READ COMMITTED. Relation additions lock destination rows before checking counts;
ordered moves lock the collection owner. All writers enforcing these semantic constraints must
use that coordination protocol. Arbitrary external SQL can bypass model constraints. MySQL can
abort a transaction on a deadlock; this adapter propagates the failure without automatic retries.

Automatic migrations, broader schema-contract diagnostics, task storage, and MariaDB compatibility
are separate work. Date/time, JSON, and large-number conformance remain a bounded follow-up; this
release does not promise every PostgreSQL physical representation works unchanged.

## Verification

```sh
pnpm --filter @ontahi/mysql test
```

Start Docker (for example, Docker Desktop) before running the suite. Tests start ephemeral
`mysql:8.4` containers using Testcontainers, create their fixture schemas, and stop/remove the
containers when the suite finishes. Each container receives a randomly generated password. No manually provisioned MySQL server is required. Alternatively, set
`ONTAHI_MYSQL_TEST_URL` to a dedicated disposable test database. Tests create and reset their own
fixture tables; do not point this variable at an application database.

The Todo Express example supports `TODO_STORAGE=mysql`. Its integration test starts the actual
Express application in two separate processes and checks persisted lists, items, tags, and order:

```sh
pnpm --filter @ontahi/example-todo-express exec vitest run src/mysql-storage.integration.test.ts
```
