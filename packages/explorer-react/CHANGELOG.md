# @ontahi/explorer-react

## 1.0.0-alpha.8

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
  - @ontahi/react@1.0.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [9f5aff6]
  - @ontahi/core@0.1.0-alpha.7
  - @ontahi/react@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
- Updated dependencies [5e4217d]
- Updated dependencies [221c150]
- Updated dependencies [221c150]
  - @ontahi/core@0.1.0-alpha.6
  - @ontahi/react@0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- bdde727: Cancel delayed Entity Ref input closing when Explorer unmounts the input.
- Updated dependencies [d48cab0]
- Updated dependencies [21a8693]
- Updated dependencies [7b4c9dc]
- Updated dependencies [b8765da]
- Updated dependencies [48278b4]
  - @ontahi/core@0.1.0-alpha.5
  - @ontahi/react@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- Updated dependencies [74dac66]
- Updated dependencies [be2af8f]
- Updated dependencies [d46a878]
- Updated dependencies [9cfa0bc]
- Updated dependencies [8321558]
  - @ontahi/core@0.1.0-alpha.4
  - @ontahi/react@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [04b573a]
  - @ontahi/core@0.1.0-alpha.3
  - @ontahi/react@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [dfd0ddc]
  - @ontahi/core@0.1.0-alpha.2
  - @ontahi/react@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- Updated dependencies [451eda5]
  - @ontahi/core@0.1.0-alpha.1
  - @ontahi/react@0.1.0-alpha.1
