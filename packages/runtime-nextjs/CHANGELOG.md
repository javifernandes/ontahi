# @ontahi/runtime-nextjs

## 1.0.0-alpha.12

### Minor Changes

- cfca984: Add the first keyword-free Devtools Console walking skeleton. It reuses the Selection grammar,
  reflection, diagnostics, and CodeMirror assistance inside `Entity.where(...).many()`,
  `Entity.where(...).first()`, and `Entity.where(...).one()`, lowers valid documents to canonical
  Graph Read requests, and executes them through the configured Runtime Transport. Console results
  can be inspected through the same visual projection used by Activity or as JSON. Exact-one
  cardinality mismatches cross the Graph Read protocol as an authority-safe structured rejection
  rather than an opaque availability failure. Boolean and enum literals use the same schema-aware,
  source-backed value controls as the Explorer Selection editor. Omitting `.where(...)` defaults to
  the canonical `all` Selection, so unfiltered reads can use `Entity.many()`, `Entity.first()`, or
  `Entity.one()` directly. `Entity.count()` and `Entity.where(Selection).count()` use the existing
  Graph Read count mode and render its scalar result without applying a row limit or cardinality.
  Many reads accept a source-backed `.limit(nonNegativeInteger)` modifier before their terminal;
  invalid limits and meaningless combinations with `first()`, `one()`, or `count()` are rejected
  before execution.

### Patch Changes

- a8e1dbc: Reopen Console completion after accepting ordering and predicate clauses so their Fields appear
  without another keystroke. Discover receiver-owned ordering permissions through a metadata-only
  graph.read request before executing data, with loading/error feedback and retry. Share that policy
  snapshot between completion, source-backed field/direction dropdowns in both dialects, and result
  headers. Preserve keyboard editing and undo, and invalidate stale metadata when Entity, transport,
  graph.read routing, or host-provided ExecutionIdentity changes. Identity changes clear prior Console
  results and cancel pending reads without discarding the draft or undo history. Support discovery through Runtime Protocol and standalone Express
  and Next.js Graph Read handlers; ordinary reads and observations retain their existing contracts.
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

## 1.0.0-alpha.11

### Patch Changes

- @ontahi/core@1.0.0-alpha.11

## 1.0.0-alpha.10

### Minor Changes

- a9e9926: Add an App Router Route Handler adapter for the common Ontahí Runtime Protocol. Hosts inject the
  transport-neutral dispatcher and derive trusted context from each Web request while the adapter
  preserves protocol correlation, semantic responses, and established HTTP error statuses.

### Patch Changes

- Updated dependencies [a389b29]
- Updated dependencies [36f16e8]
  - @ontahi/core@1.0.0-alpha.10

## 1.0.0-alpha.9

### Minor Changes

- 71b3d4d: Add named portable Domain Operation input conditions backed by canonical Model Expression IR.
  Codegen compiles natural Ref-identity expressions without executing callbacks, emits one condition
  registry shared by server and generated clients, and reports unsupported syntax at its source.
  Core evaluates conditions authoritatively before the body and exposes tri-state advisory
  evaluation, dependencies, conventional rejection, reflection, and an explicit runtime-only
  builder. Explorer presents reflected condition names.

  Callback-valued top-level `contracts.pre` and `contracts.post` are removed during the alpha. Move
  arbitrary server-only checks to `contract({ pre, post })` in `concerns`; top-level
  `contracts.pre` now accepts named portable conditions.

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

### Patch Changes

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

### Minor Changes

- 5273c95: Add an App Router graph-read handler that validates canonical requests, derives authority from a
  trusted invocation context, and preserves the Express adapter's protocol status semantics.

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

### Minor Changes

- 451eda5: Add a provider-neutral authentication Principal, invocation-scoped auth APIs and requirements, and
  Express and Next.js request hooks for supplying invocation context without coupling Ontahi to an
  identity provider.

### Patch Changes

- Updated dependencies [451eda5]
  - @ontahi/core@0.1.0-alpha.1
