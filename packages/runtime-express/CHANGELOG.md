# @ontahi/runtime-express

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
  - @ontahi/explorer-react@1.0.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [9f5aff6]
  - @ontahi/core@0.1.0-alpha.7
  - @ontahi/explorer-react@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [5e4217d]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
  - @ontahi/core@0.1.0-alpha.6
  - @ontahi/explorer-react@0.1.0-alpha.6

## 0.1.0-alpha.5

### Minor Changes

- 692964d: Add an opt-in Express graph-read endpoint backed by the transport-neutral dispatcher and trusted
  server request context.
- 48278b4: Add a Fetch-backed React graph-read executor, preserve typed Effect failures across the browser
  Promise boundary, and let Express applications expose policy-scoped reads from their configured
  application storage and invocation context without constructing a dispatcher manually.

### Patch Changes

- Updated dependencies [bdde727]
- Updated dependencies [d48cab0]
- Updated dependencies [21a8693]
- Updated dependencies [7b4c9dc]
- Updated dependencies [b8765da]
- Updated dependencies [48278b4]
  - @ontahi/explorer-react@0.1.0-alpha.5
  - @ontahi/core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [74dac66]
- Updated dependencies [be2af8f]
- Updated dependencies [d46a878]
- Updated dependencies [9cfa0bc]
- Updated dependencies [8321558]
  - @ontahi/core@0.1.0-alpha.4
  - @ontahi/explorer-react@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [04b573a]
  - @ontahi/core@0.1.0-alpha.3
  - @ontahi/explorer-react@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [dfd0ddc]
  - @ontahi/core@0.1.0-alpha.2
  - @ontahi/explorer-react@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- 451eda5: Add a provider-neutral authentication Principal, invocation-scoped auth APIs and requirements, and
  Express and Next.js request hooks for supplying invocation context without coupling Ontahi to an
  identity provider.

### Patch Changes

- Updated dependencies [451eda5]
  - @ontahi/core@0.1.0-alpha.1
  - @ontahi/explorer-react@0.1.0-alpha.1
