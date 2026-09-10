# @ontahi/sql

Shared SQL building blocks used by Ontahi's PostgreSQL and MySQL adapters. Applications normally
configure `@ontahi/postgres` or `@ontahi/mysql` directly.

The package root and `/data-graph` export:

- Conventional Entity mappings, naming, and mapping validation.
- `createSqlQueryCompiler(dialect)` for parameterized Selections, projections, ordering, and counts.
- `createSqlDerivedFieldCompiler(dialect)` for the existing derived-field expression vocabulary.
- `createSqlReadRuntime(...)` for materializing projections, nested relations, related-root reads,
  and one-execution row streams from an injected SQL executor.

`SqlDialect` supplies identifier quoting, placeholders, count syntax, and null ordering. It is a
small boundary extracted from two working adapters, not a claim that arbitrary SQL engines are
interchangeable. Query values remain separate from SQL text.

Provider packages own drivers, mutation compilation, exact mutation results, locking, transaction
lifecycle, and schema introspection. This package neither opens connections nor manages migrations.

The colocated conformance fixtures are shared repository tests and are excluded from published
artifacts. PostgreSQL's existing tests exercise the extracted implementation, while MySQL executes
the supported shared cases against MySQL 8.4.
