# 151. MySQL Data Graph Storage

Status: done

Canonical ID: `ontahi://plans/151-mysql-data-graph-storage`

## Summary

Add `@ontahi/mysql` so applications can choose MySQL persistence while retaining their Ontahi
Entities, Selections, Queries, Commands, and Operations. The MySQL 8.4/InnoDB delivery is complete
for the supported contract below, including the Todo application. Broader physical-type and schema
conformance continues in [151b](../next/151b-mysql-type-and-schema-conformance.md).

The primary risk is semantic portability of mutations and concurrency, not SQL syntax generation.
The existing PostgreSQL adapter relies on `RETURNING`, guarded mutations, and transaction-scoped
serialization. MySQL needs its own execution strategy for those guarantees.

## Evidence

Repository inspection on 2026-09-10:

- `packages/core/src/data-graph/storage.ts` provides the technology-independent assembly boundary:
  Entity binding, runtime construction, reflected Entity reads, and optional related Entity reads.
- `packages/postgres/src/data-graph/storage.ts` demonstrates conventional and explicit mappings.
- `packages/postgres/src/data-graph/runtime-conformance.test-support.ts` contains reusable behavioral
  cases, currently owned by the PostgreSQL package.
- `packages/postgres/src/data-graph/command-runtime.ts` relies on affected rows and returned records
  to enforce cardinality and construct mutation results.
- `packages/postgres/src/data-graph/transaction.ts` and relation-count execution establish connection
  ownership and serialization requirements that a new provider must preserve.

External references:

- [MySQL 8.4 INSERT](https://dev.mysql.com/doc/refman/8.4/en/insert.html): its syntax does not provide
  PostgreSQL-style `RETURNING`; generated identifiers and exact returned records need explicit handling.
- [MariaDB/MySQL differences](https://mariadb.com/docs/release-notes/community-server/about/compatibility-and-differences/mariadb-vs-mysql-features):
  MariaDB compatibility must be verified separately.
- [MariaDB INSERT](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/inserting-loading-data/insert):
  MariaDB has its own `RETURNING` support, so a shared wire protocol is insufficient evidence of dialect parity.

## Proposed public form

Initial public API:

```ts
import { createPool } from 'mysql2/promise';
import { createMysqlDataGraphStorage } from '@ontahi/mysql';

const storage = createMysqlDataGraphStorage({
  pool: createPool(process.env.DATABASE_URL!),
});

const application = ontahi({
  storage,
  entities: [TodoList, TodoItem, Tag],
});
```

The host owns pool lifecycle, database credentials, schema, migrations, indexes, and grants.
Start with an explicitly tested MySQL 8.4/InnoDB target. Preserve conventional mapping names and
focused overrides. Keep provider details out of Core.

## Delivery slices

1. Establish MySQL integration infrastructure and the first complete application path: mapping,
   parameterized reads, create/update/delete, exact results, transactions, reflection, and Todo
   persistence across a host restart. Specify the supported contract and reject unsupported behavior
   explicitly. Do not advertise PostgreSQL parity at this milestone.
2. Complete query and command conformance: scalar predicates, references, projections, nested and
   related-root reads, derived fields, bulk mutations, upsert, cardinality, and rollback. Extract only
   the test cases needed for shared provider conformance; avoid a speculative universal SQL layer.
3. Implement and prove relationship mutations, preconditions, ordered relations, exact deltas, and
   serialized count constraints. Include competing connections and failure-path tests.
4. Complete package consumption and release integration, documentation, and the runnable example.

## Design questions to settle through executable proofs

- How are preimages, postimages, defaults, generated identifiers, and delete results recovered on
  the same connection without guessing identifier ranges or reselecting a changed predicate?
- How does a cardinality failure roll back every write, including when caught inside a larger
  transaction? Decide whether internal savepoints are needed without promising public nesting.
- How are matched rows distinguished from changed rows for updates that retain the same values?
- How does upsert preserve Ontahi's explicit conflict target when MySQL can detect a conflict on
  another unique key? Do not silently substitute different conflict semantics or broad `INSERT IGNORE`.
- Which locks and isolation rules protect relationship constraints against concurrent mutations?
- Which physical types, collations, null ordering, date/time settings, and number conversions preserve
  the semantic contract? Document host requirements and fail explicitly when needed.
- What cleanup is required after interruption, statement failure, commit failure, or rollback failure?

## Acceptance

- [x] `@ontahi/mysql` assembles through the existing storage contract with public typed exports.
- [x] In-memory and real MySQL execute shared observable conformance cases.
- [x] Values are parameterized; mapped identifiers are quoted safely.
- [x] References, result shapes, counts, limits, ordering, and null behavior match the supported contract.
- [x] Mutations return exact results and deltas, including defaults and generated identities.
- [x] Cardinality failures and command failures leave no partial mutation.
- [x] Transactions retain one connection and clean up on success, failure, and interruption.
- [x] Concurrent relationship tests prove preconditions and declared constraints.
- [x] Reflection supports search, filters, sorting, pagination, and actionable mapping drift diagnostics.
- [x] Todo can choose MySQL and retains data after restart using host-owned schema and configuration.
- [x] README and developer documentation identify supported versions and any remaining limitations.
- [x] Workspace lockfile, CI detection, release package inventory, and Changesets fixed group include the package.
- [x] Package tests, typecheck, build, lint, formatting, and artifact verification pass.
- [x] Packed artifacts execute a representative runtime path from a clean consumer.

## Boundaries and follow-up

Automatic migration generation and task storage are separate work. A shared SQL compiler should
emerge only from concrete duplication with compatible semantics; MySQL must not depend on the
PostgreSQL adapter as its implementation API.

SQLite is a subsequent storage candidate. MariaDB is a separately tested compatibility target,
possibly sharing implementation when evidence supports it. Neither is included in this delivery.

Property graph execution and standards are investigated in
[151a](../research/151a-property-graph-storage-and-query-standards.md). That investigation must not
block MySQL or enlarge this plan into a universal database platform.

## Initial slice verification (historical)

The initial implementation is isolated in the `codex/mysql-storage` worktree. Planning was
committed separately before implementation.

Implemented:

- `@ontahi/sql`: extracted mappings, query and derived-field compilation, relation read
  materialization, and repository-only conformance fixtures. PostgreSQL keeps compatible public
  entrypoints and its own mutation and transaction implementation.
- `@ontahi/mysql`: storage assembly, reflection, scalar and relation reads, CRUD and bulk inserts,
  exact returning records and Entity Mutation deltas, explicit READ COMMITTED transactions,
  serialized transaction-runtime execution, and per-command savepoints.
- MySQL mutation tables must be InnoDB with mapped primary keys. Updates and deletes lock original
  membership and address keys; inserts read each generated key independently.
- Public package topology, Changeset, developer documentation, and packed-consumer imports/smoke.

The first MySQL suite passed 39 tests with two explicit upsert cases skipped because upsert is
not supported. It includes the in-memory baseline from the same conformance suite. PostgreSQL's
98 existing tests passed, including its real-database integration suite; SQL compiler tests passed.
All package builds, affected-package typechecks and lint checks, touched-file formatting, and
`pnpm verify:artifacts -- --skip-build` passed. Artifact verification installs all 15 tarballs into
a clean consumer, typechecks their entrypoints, and executes the separate MySQL read smoke.
The concurrency test allows exactly one of two competing conditional updates to apply. Interruption
rolls back the transaction; catching a bulk-command failure preserves only subsequent successful work.

Pending after the initial slice:

- Upsert with explicit conflict-target semantics, primary-key updates, and wider physical-type
  conformance (including derived fields, date/time, JSON, and large numeric values).
- Direct/many-to-many/ordered Relationship Commands and concurrent relation-constraint proofs.
- Full Todo application configuration and persistence-through-restart demonstration.
- Wider schema-contract diagnostics and MariaDB evaluation as a subsequent compatibility target.

At that stage, the package README documented those limitations and the plan stayed current.
That initial slice did not complete the acceptance checklist.

## Completion and scope decision

The second slice completes upsert with explicit full unique-index targets, primary-key updates,
direct Relationship Commands, many-to-many set mutations, and ordered moves. All commands share
one savepoint boundary and serialized use of the transaction connection. Destination locks protect
count limits, owner locks serialize collection moves, and temporary positions avoid transient
violations of MySQL's immediate unique-index checks.

The Todo Express host now selects MySQL through configuration and owns its migration, join indexes,
foreign keys, and append-position trigger. A two-process integration test creates lists/items,
adds a tag, moves an item, shuts down the first Express host, and verifies the same graph after the
second host starts. This exposed a Core composition bug: relation rematerialization discarded
explicit mappings. A focused regression failed before the fix and now passes with preserved mapping
metadata.

Final MySQL coverage includes 62 passing tests (with no skipped upsert cases), derived-field
projection/filter/order, actual concurrent upsert/count/edge/order operations, transaction
interruption, caught-command rollback, and simulated begin/commit/rollback failure cleanup.
Core's 916 tests pass. Todo's 68 existing tests pass, and its new two-process MySQL integration
passes after correcting the expected serialized Ref shape. All package builds, affected
typechecks/lint, and packed artifact verification pass; the clean consumer executes the MySQL read
interpreter from the published tarball layout.

The remaining physical-type matrix (date/time, JSON, and large numbers) and richer schema diagnostics
are explicitly extracted to [151b](../next/151b-mysql-type-and-schema-conformance.md). They do not
block the demonstrated Todo contract; they do prevent claiming arbitrary PostgreSQL schema parity.
Automatic migrations, task storage, SQLite, and separately tested MariaDB remain outside this
completed delivery. The package contract states these limits.

## PR validation hardening

PR 151 exposed a coverage ownership gap: the extracted SQL read runtime was exercised by provider
integration tests, but the SQL package's own coverage report recorded it as untested. Direct SQL
runtime tests now verify projection/reference materialization, ordered and many-to-many includes,
all related-root result modes and empty memberships, inverse edges, counts, streams, and failures.
Provider integration tests remain the proof of actual MySQL/PostgreSQL execution.

Shared related-root resolution and MySQL command helpers now separate membership, mutation, and
result materialization, removing duplicated branches and the reported complexity issues without
changing the locking/rollback contract. MySQL fixtures generate a random password per container;
the local Todo host accepts DATABASE_URL or TODO_MYSQL_PASSWORD instead of embedding a MySQL
password. No scanner exclusion or coverage threshold reduction is used.

Verification after these review changes: SQL 18 tests, MySQL 62 tests, PostgreSQL 98 tests, and
Todo 69 tests pass. SQL read-runtime line coverage exceeds 97%; MySQL package line coverage exceeds
93%. Final CI/Codecov/Sonar results are attached to PR 151 rather than inferred from these local
package percentages.
