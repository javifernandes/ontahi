# @ontahi/sql

## 1.0.0-alpha.13

### Patch Changes

- Updated dependencies [7a9bb92]
- Updated dependencies [a35b2d0]
- Updated dependencies [8a7eaec]
- Updated dependencies [7eaddca]
- Updated dependencies [0802a01]
- Updated dependencies [03c1af6]
- Updated dependencies [c275332]
- Updated dependencies [399f7f5]
- Updated dependencies [f5e085f]
- Updated dependencies [7c2a6b9]
- Updated dependencies [c275332]
- Updated dependencies [8ab4218]
- Updated dependencies [c275332]
- Updated dependencies [b807692]
- Updated dependencies [ddec3e7]
- Updated dependencies [3252d6c]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [f552bed]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [5ea8abd]
- Updated dependencies [96d8092]
- Updated dependencies [5b13c9a]
- Updated dependencies [f552bed]
- Updated dependencies [8ff883f]
- Updated dependencies [e114d60]
- Updated dependencies [d1d3f36]
- Updated dependencies [82d155a]
- Updated dependencies [072ad16]
- Updated dependencies [848b50d]
- Updated dependencies [9904cff]
  - @ontahi/core@1.0.0-alpha.13

## 1.0.0-alpha.12

### Minor Changes

- 40b6e3c: Execute local contextual Selection reads in PostgreSQL as correlated EXISTS subqueries, without
  prefetching source IDs. Nested/self relations, direct belongs-to/has-many joins, and single-identity
  many-to-many joins preserve set membership before final projection, ordering, limits and counts.
  SQL compilation requires explicit receiver-owned Selection mappings; custom SQL runtimes remain
  opted out. Composite edge joins and virtual filter fields fail explicitly. Commands and graph read
  protocol v1 still reject relational membership until their authority/transport contracts are implemented.
- b81adfe: Add MySQL 8.4/InnoDB storage with exact CRUD results, explicit-target upsert, primary-key updates,
  Entity Mutation deltas, direct/many-to-many/ordered Relationship Commands, transactions, command
  savepoints, and reflected Entity data. Include concurrent constraint tests and a Todo Express
  configuration with persistence verified across host restarts.

  Extract shared mappings, query compilation, and read materialization into @ontahi/sql while
  preserving PostgreSQL's public entrypoints and provider-owned mutation implementation.

  Preserve explicit relation mappings during Core application composition so physical join mappings
  remain available to the storage adapter. Date/time, JSON, large-number conformance, and broader
  schema diagnostics continue separately in Plan 151b.

### Patch Changes

- 40b6e3c: Add experimental deferred relation-image membership, Selection.through and parameterless contextual
  Selection factories. Selection schemas validate source paths against explicit receiver-owned model
  definitions, and in-memory reads evaluate composed navigation before final read shaping. Commands
  and graph read protocol v1 explicitly reject this membership. PostgreSQL/MySQL and Supabase support
  contextual reads within their documented provider limits. Entities can declare contextual selections with
  `selections: ({ self }) => ({ parts: self.contentNodes.where(node => node.type.eq('part')) })`.
  Selection properties preserve deferred membership and target types through composition and runtime
  binding. Discovery exposes copied contracts; codegen compiles supported declarations to portable
  data for generated clients. Both Console dialects author navigation, while remote execution uses
  capability-negotiated Graph Read v2 with per-hop grants. Contextual observation remains deferred.
- 40b6e3c: Validate exact-one Selection membership before read limits, including policy-imposed limits and
  related-root reads. PostgreSQL and MySQL probe for a second match in the same SQL statement;
  Supabase requests an exact count with the rows so server row caps cannot masquerade as uniqueness.
  Supabase exact-one reads fail closed when exact count metadata is unavailable.

  Enforce the same cardinality contract for counts, reject contradictory exact-one reads with
  `limit(0)`, and preserve cardinality diagnostics through Effect-backed read dispatchers. Nullable
  first-result and existence intent, many-result shaping, and atomic mutation semantics are unchanged.

- Updated dependencies [d293ff1]
- Updated dependencies [14026dd]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [d293ff1]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [6770db7]
- Updated dependencies [40b6e3c]
- Updated dependencies [b81adfe]
- Updated dependencies [65e6d30]
- Updated dependencies [ced6a65]
- Updated dependencies [cfca984]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [d293ff1]
- Updated dependencies [6770db7]
- Updated dependencies [740cfd0]
- Updated dependencies [5d9f605]
- Updated dependencies [cfca984]
- Updated dependencies [5af84ba]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [96629f2]
- Updated dependencies [8e627d2]
  - @ontahi/core@1.0.0-alpha.12
