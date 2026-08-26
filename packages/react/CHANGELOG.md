# @ontahi/react

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

- 2d526f3: Reflect semantic Relation descriptors, render portable Entity references as navigable identity, and
  support read-only related-instance panels through a host-provided Query-backed reader. Schema
  reflection also exposes undeclared inverse endpoints as non-executable, read-only topology.
- 3165893: Make top-level Domain Operation Ref inputs schema-native: declare `field.ref(Entity)` once, use the
  Ref directly with `resolve()`, `invalidate()`, and `refresh()` in server implementations, preserve
  portable Refs across the client bridge, and derive Explorer Ref controls from reflected schema.

  Remove the transitional authored `inputRefs` Domain Operation contract and legacy scalar lowering.

  Migration: replace declarations such as `inputRefs: { book: app.graph.refInput(Book) }` plus
  `run: ({ refs }) => refs.book.resolve()` with a single schema field
  `input: graphSchema.object({ book: field.ref(Book) })` and access it directly as
  `run: ({ book }) => book.resolve()`. Bridge and client-cache `queryRef('book')`/`cacheRef('book')`
  now require `input.book` to be a portable Entity Ref; scalar substitutes such as `bookId` or
  `bookSlug` are no longer lowered or accepted as Ref identity.

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

### Minor Changes

- 5e4217d: Bind generated client Entity facades to direct or Fetch-backed runtimes for fluent Query execution
  outside React hooks while preserving their portable Views, Refs, and Domain Operations.

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

- d48cab0: Add portable generated-client Query entry points, explicit read intents, shared execution identity,
  canonical identity-scoped React query keys, a conventional Fetch graph client, and bound
  first-class Operation invocation hooks.
- 48278b4: Add a Fetch-backed React graph-read executor, preserve typed Effect failures across the browser
  Promise boundary, and let Express applications expose policy-scoped reads from their configured
  application storage and invocation context without constructing a dispatcher manually.

### Patch Changes

- Updated dependencies [d48cab0]
- Updated dependencies [21a8693]
- Updated dependencies [7b4c9dc]
- Updated dependencies [b8765da]
- Updated dependencies [48278b4]
  - @ontahi/core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Minor Changes

- 9cfa0bc: Carry recursive Views through projectable Operation invocations and expose typed `.as(view)`
  results to React Operation queries.

### Patch Changes

- Updated dependencies [74dac66]
- Updated dependencies [be2af8f]
- Updated dependencies [d46a878]
- Updated dependencies [9cfa0bc]
- Updated dependencies [8321558]
  - @ontahi/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 04b573a: Add opt-in, JSON-safe internal operation error causes for development diagnostics while keeping
  transported failures sanitized by default. Preserve transported operation failures as serializable
  React error causes.
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
