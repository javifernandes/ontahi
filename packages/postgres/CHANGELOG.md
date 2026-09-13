# @ontahi/postgres

## 1.0.0-alpha.12

### Minor Changes

- 40b6e3c: Execute local contextual Selection reads in PostgreSQL as correlated EXISTS subqueries, without
  prefetching source IDs. Nested/self relations, direct belongs-to/has-many joins, and single-identity
  many-to-many joins preserve set membership before final projection, ordering, limits and counts.
  SQL compilation requires explicit receiver-owned Selection mappings; other SQL runtimes remain
  opted out. Composite edge joins and virtual filter fields fail explicitly. Commands and graph read
  protocol v1 still reject relational membership until their authority/transport contracts are implemented.
- 40b6e3c: Connect contextual Selection reads through application storage and remote clients. In-memory and
  PostgreSQL storage declare graphReadCapabilities.relationSelections, which enables application
  Graph Read v2 receivers while retaining explicit per-hop policy grants.

  Remote and React graph clients discover the target's v2 capability before each contextual read,
  using the same transport options for metadata and execution. Ordinary reads stay v1 with no
  extra requests; missing capabilities and read denials never fall back to v1 or prefetch IDs.

  Custom RemoteGraphReadTransport implementations now accept GraphReadFamilyRequest (metadata and
  v1/v2 reads); narrow by kind before reading mode or selection. Contextual observation remains
  unsupported pending source-change invalidation.

- 65e6d30: Add native ordered `hasMany` Relations with portable move commands, exact neighborhood conflict
  checks and deltas, natural ordered reads, in-memory and transactional PostgreSQL execution,
  Fetch/WebSocket transport support, React hooks, reflection, and semantic Devtools summaries.

### Patch Changes

- b81adfe: Add MySQL 8.4/InnoDB storage with exact CRUD results, explicit-target upsert, primary-key updates,
  Entity Mutation deltas, direct/many-to-many/ordered Relationship Commands, transactions, command
  savepoints, and reflected Entity data. Include concurrent constraint tests and a Todo Express
  configuration with persistence verified across host restarts.

  Extract shared mappings, query compilation, and read materialization into @ontahi/sql while
  preserving PostgreSQL's public entrypoints and provider-owned mutation implementation.

  Preserve explicit relation mappings during Core application composition so physical join mappings
  remain available to the storage adapter. Date/time, JSON, large-number conformance, and broader
  schema diagnostics continue separately in Plan 151b.

- 22d6848: Restrict PostgreSQL `SELECT` lists to caller-selected Fields plus the internal join keys required
  for Relations, avoiding transfer of unselected wide columns while preserving public result shapes.
- Updated dependencies [14026dd]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [40b6e3c]
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
  - @ontahi/sql@1.0.0-alpha.12

## 1.0.0-alpha.11

### Patch Changes

- 1b62f19: Compile selected Relations without traversing cyclic Entity definitions while discovering derived Fields.
- @ontahi/core@1.0.0-alpha.11

## 1.0.0-alpha.10

### Patch Changes

- 36f16e8: Allow scalar Entity fields to declare a reusable semantic value type with `field.named`. Reflected
  Entity data and operation schemas preserve that type so Explorer controls can be selected from the
  domain model instead of field-name conventions. The Todo example now declares `Color` this way,
  and Explorer renders it with a color picker while simplifying required one-Entity selections.
- Updated dependencies [a389b29]
- Updated dependencies [36f16e8]
  - @ontahi/core@1.0.0-alpha.10

## 1.0.0-alpha.9

### Minor Changes

- 0544f8b: Add typed `if` conditions to exact Ref-targeted Entity update/delete Commands. In-memory,
  PostgreSQL, Supabase, and remote execution apply identity and authorized equality conditions in one
  atomic mutation, return one authority-safe rejection when it does not apply, and use a fail-closed
  wire version so older servers cannot silently execute an unconditional mutation.
- 926919d: Add virtual read-only derived Fields backed by portable Model Expressions. Codegen compiles natural
  Field and Relation expressions, Core reflects and evaluates exact dependencies in memory,
  PostgreSQL lowers the same IR to authorized graph reads, and Explorer presents derived metadata and
  runtime values without exposing assignment.
- 015893f: Keep schema-only Entities in generated clients and add reflected Entity creation to the Explorer.

  Expose forward and inverse related-instance reads, counts, and drill-downs through in-memory and
  PostgreSQL storage, the Ontahi application runtime, Express, and the default React fetch client.
  Make the in-memory Data Graph runtime transactional so atomic Operations have the same local
  execution contract as transactional adapters.

- 31878c3: Bridge portable identity-scoped Entity Mutation Commands through a versioned default-deny remote
  boundary. Create, exact update, and exact delete now execute through PostgreSQL and Fetch with
  server-owned schema validation, explicit per-action mutation/result Field allowlists, exact deltas,
  and structured cardinality rejections.
- 2242b00: Add portable `relationConstraint.countAtMost(...)` metadata and prospective in-memory enforcement
  for direct to-many Relations. PostgreSQL now serializes competing additions on the destination
  endpoint before evaluating the aggregate from a fresh transaction snapshot, while Supabase fails
  closed until its RPC can provide the same authority-serialized guarantee.

### Patch Changes

- Updated dependencies [82654bc]
- Updated dependencies [0544f8b]
- Updated dependencies [2ed9511]
- Updated dependencies [926919d]
- Updated dependencies [a5d07f1]
- Updated dependencies [71b3d4d]
- Updated dependencies [015893f]
- Updated dependencies [31878c3]
- Updated dependencies [caf7b08]
- Updated dependencies [5a9246f]
- Updated dependencies [8def4c1]
- Updated dependencies [2242b00]
- Updated dependencies [ea87f14]
- Updated dependencies [58fcaae]
- Updated dependencies [3a3119b]
  - @ontahi/core@1.0.0-alpha.9

## 1.0.0-alpha.8

### Major Changes

- fd725a2: Return explicit applied or not-applied Relationship Command results, add conditional
  `onMismatch: 'skip'`, and preserve structured precondition and constraint diagnostics through
  direct providers and the remote Express/Fetch bridge.

  This replaces the raw `RelationshipDelta` previously returned by provider, remote, and React graph
  executors. Those consumers must first check `result.status`; applied commands expose the exact
  delta through `result.delta`, while `not-applied` commands expose a diagnostic and have no delta.
  Application-bound callers must likewise narrow `result.status` before reading
  `result.outcome.delta` or `result.reactions`. Existing callers that intentionally retain
  failure-on-mismatch behavior can omit `onMismatch` or use `onMismatch: 'fail'`.

### Minor Changes

- aa8659c: Define an optional compositional Data Graph transaction capability and implement it for PostgreSQL
  with one checked-out connection, typed callback failures, and real commit/rollback behavior.
- 4b5b893: Execute direct Relationship Commands through PostgreSQL with atomic conditional to-one assignment.
- f579e0f: Resolve direct Relation constraints against canonical participants and enforce portable
  source/target eligibility atomically across PostgreSQL and Supabase direct and many-to-many
  Relationship Commands, preserving structured rejection descriptors without partial edge changes.

### Patch Changes

- ca98ccd: Execute direct Relationship Commands through an atomic invoker-rights Supabase RPC, and resolve
  constrained inverse `hasMany` Relations from a unique target `belongsTo` field when `via` is omitted.
- Updated dependencies [aa8659c]
- Updated dependencies [213f4ec]
- Updated dependencies [2d526f3]
- Updated dependencies [0ad7a06]
- Updated dependencies [4dd7be4]
- Updated dependencies [0247a29]
- Updated dependencies [fd725a2]
- Updated dependencies [3165893]
- Updated dependencies [f3f292c]
- Updated dependencies [ca98ccd]
- Updated dependencies [f579e0f]
- Updated dependencies [302e4d3]
  - @ontahi/core@1.0.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [9f5aff6]
  - @ontahi/core@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [5e4217d]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
  - @ontahi/core@0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- Updated dependencies [d48cab0]
- Updated dependencies [21a8693]
- Updated dependencies [7b4c9dc]
- Updated dependencies [b8765da]
- Updated dependencies [48278b4]
  - @ontahi/core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [74dac66]
- Updated dependencies [be2af8f]
- Updated dependencies [d46a878]
- Updated dependencies [9cfa0bc]
- Updated dependencies [8321558]
  - @ontahi/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [04b573a]
  - @ontahi/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [dfd0ddc]
  - @ontahi/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- Updated dependencies [451eda5]
  - @ontahi/core@0.1.0-alpha.1
