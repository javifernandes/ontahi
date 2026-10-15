# @ontahi/mysql

MySQL-backed runtime capabilities for Ontahi, tested with MySQL 8.4 and InnoDB. The package is not
a generic SQL client or one monolithic adapter: applications may independently use its Data Graph
storage, durable Task Storage, Event Runtime, or any combination of them. It uses `mysql2/promise`; the Data Graph implementation
also uses the shared `@ontahi/sql` read layer. This release does not claim full PostgreSQL parity.

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

The host owns the pool lifecycle, credentials, physical schema, migrations, and grants. Keep the
pool alive for the application lifetime and close it on host shutdown.

## Public entrypoints

The package root and `/data-graph` export `createMysqlDataGraphStorage`,
`createMysqlDataGraphRuntime`, `mysqlMapping`, `mysqlNaming`, `inferMysqlMappings`, query/selection
compilers, reflection readers, and `MysqlDataGraphError`.

The package root and `/events` export `createMysqlEventRuntime`,
`createMysqlEventSchemaSql`, and the configurable Event table-name contract.

The package root and `/tasks` export `createMysqlTaskStorage`, `createMysqlTaskSchemaSql`, and the
configurable Task run table contract.

## Durable Task Storage

```ts
import { createPool } from 'mysql2/promise';
import { createMysqlTaskStorage } from '@ontahi/mysql/tasks';

const pool = createPool(process.env.DATABASE_URL!);
const taskStorage = createMysqlTaskStorage({ pool });
```

The host applies `createMysqlTaskSchemaSql()` through its migration system. The storage persists
private execution checkpoints and public snapshots, supports actor-scoped listings and runtime
references, and atomically claims pending Interaction and Event continuations with conditional
InnoDB updates. It passes Core's provider-neutral Task Storage conformance proof and supports
restart recovery when combined with the independently configured MySQL Event Runtime.

Task writes are not automatically atomic with Data Graph mutations or Event acceptance. The host
owns retention, migrations, grants, pool lifecycle, and any broader transaction composition.

Storage infers plural snake-case tables and snake-case columns using the same conventions as
PostgreSQL. Use `overrides` for physical exceptions, or pass explicit `mappings`. Standalone runtime
construction requires mappings and a promise pool exposing `execute` and `getConnection`.

## Durable Event Runtime

```ts
import { createPool } from 'mysql2/promise';
import { createMysqlEventRuntime, createMysqlEventSchemaSql } from '@ontahi/mysql/events';

const pool = createPool(process.env.DATABASE_URL!);
const eventRuntime = createMysqlEventRuntime({ pool });
```

The host applies the statements from `createMysqlEventSchemaSql()` through its migration system;
runtime construction never migrates automatically. Table names are configurable for hosts that
need a prefix or an existing naming convention.

The Event Runtime provides retained occurrences, stable subscription definitions, JSON correlation
matching, registration backfill, acceptance-ordered claims, leased retries, acknowledgement,
release, cancellation, runtime recreation, and process-local live subscribers. Registration and
acceptance share a MySQL user lock scoped to the configured table set, closing the race between
backfill and publication. Competing claims use InnoDB row locks with `SKIP LOCKED`; claim identity
and lease expiry fence stale workers.

Its advertised capabilities are durable acceptance, durable delivery, acknowledgement, retention,
and per-subscription ordering. It deliberately advertises no replay cursor, deduplication, or atomic
publication with Data Graph mutations. Cancellation stops future delivery creation without deleting
retained occurrences or deliveries already created. The deployment must permit
`GET_LOCK`/`RELEASE_LOCK`, and the generated tables must remain InnoDB, for these guarantees.

The adapter has the same Core semantic contract and conformance proof as PostgreSQL, but its schema,
locking, JSON predicates, and deterministic hashed delivery identities are MySQL-owned details.
Using `/events` does not configure or require `/data-graph`.

## Data Graph behavior

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

Automatic migrations, broader schema-contract diagnostics, Event replay/history,
atomic Data Graph/Event publication, and MariaDB compatibility are separate work. Date/time, JSON,
and large-number Data Graph conformance remain a bounded follow-up; this release does not promise
every PostgreSQL physical representation works unchanged.

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
