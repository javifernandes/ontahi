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

Experimental contextual membership is read-only and opt-in. `compileQuery` accepts receiver-owned
`selectionMappings` to validate and compile `relation-image` to correlated `EXISTS`; `compileSelection`
and mutation compilers remain closed. `createSqlReadRuntime({ relationSelections: true, ... })`
passes its registered mappings into read/count compilation. PostgreSQL enables this option; MySQL
does not yet enable it. Source/target join fields come from declared Relations, never the caller's
AST. Stored filter fields and single-field-identity many-to-many edges are supported; virtual filters
and composite edge joins fail explicitly. This is not a graph-read protocol permission or capability.

The colocated conformance fixtures are shared repository tests and are excluded from published
artifacts. PostgreSQL's existing tests exercise the extracted implementation, while MySQL executes
the supported shared cases against MySQL 8.4.
