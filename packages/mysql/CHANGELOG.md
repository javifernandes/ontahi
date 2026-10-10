# @ontahi/mysql

## 1.0.0-alpha.13

### Patch Changes

- Updated dependencies [7a9bb92]
- Updated dependencies [b862f5b]
- Updated dependencies [a35b2d0]
- Updated dependencies [8a7eaec]
- Updated dependencies [7eaddca]
- Updated dependencies [31b5311]
- Updated dependencies [0802a01]
- Updated dependencies [03c1af6]
- Updated dependencies [7d002a0]
- Updated dependencies [c275332]
- Updated dependencies [db4b8c9]
- Updated dependencies [399f7f5]
- Updated dependencies [f5e085f]
- Updated dependencies [2305a9d]
- Updated dependencies [c01cd23]
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
- Updated dependencies [67fc06a]
- Updated dependencies [eebeeec]
- Updated dependencies [8ff883f]
- Updated dependencies [e114d60]
- Updated dependencies [d1d3f36]
- Updated dependencies [82d155a]
- Updated dependencies [072ad16]
- Updated dependencies [27d5253]
- Updated dependencies [848b50d]
- Updated dependencies [24d99ef]
- Updated dependencies [9904cff]
  - @ontahi/core@1.0.0-alpha.13
  - @ontahi/sql@1.0.0-alpha.13

## 1.0.0-alpha.12

### Minor Changes

- b81adfe: Add MySQL 8.4/InnoDB storage with exact CRUD results, explicit-target upsert, primary-key updates,
  Entity Mutation deltas, direct/many-to-many/ordered Relationship Commands, transactions, command
  savepoints, and reflected Entity data. Include concurrent constraint tests and a Todo Express
  configuration with persistence verified across host restarts.

  Extract shared mappings, query compilation, and read materialization into @ontahi/sql while
  preserving PostgreSQL's public entrypoints and provider-owned mutation implementation.

  Preserve explicit relation mappings during Core application composition so physical join mappings
  remain available to the storage adapter. Date/time, JSON, large-number conformance, and broader
  schema diagnostics continue separately in Plan 151b.

- f16a848: Support contextual Selection reads in MySQL using the shared SQL correlated-EXISTS compiler, including nested/self navigation, set composition, many-to-many membership and final read shaping. MySQL storage now advertises Graph Read v2 relational Selection support; receivers retain per-hop grants and policy scopes. No source-ID prefetch is used. Contextual Commands, composite many-to-many identities and virtual filter fields remain unsupported.

### Patch Changes

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
  - @ontahi/sql@1.0.0-alpha.12
