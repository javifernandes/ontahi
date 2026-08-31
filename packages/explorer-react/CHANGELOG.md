# @ontahi/explorer-react

## 1.0.0-alpha.9

### Minor Changes

- 2ed9511: Add `graphSchema.existingRef(Entity)` for immediate Domain Operation inputs. Callers keep sending
  portable Refs, while the authorized UnitOfWork materializes typed participants before the body,
  preserves their original `.ref` identity, reports conventional missing-Entity failures, and
  reflects the requirement through JSON Schema, generated clients, and Explorer.

  Domain Operation bodies may also use `Effect.fn(function* (...) { ... })` or direct `*run(...)`
  Effect generators. The direct form keeps contextual input typing and follows the ordinary Effect
  execution path for contracts, UnitOfWork, atomicity, failures, and defects.

- 926919d: Add virtual read-only derived Fields backed by portable Model Expressions. Codegen compiles natural
  Field and Relation expressions, Core reflects and evaluates exact dependencies in memory,
  PostgreSQL lowers the same IR to authorized graph reads, and Explorer presents derived metadata and
  runtime values without exposing assignment.
- 3069b93: Make reflected Entity instances the Explorer's primary canvas when data reads are available, using
  a searchable Entity switcher instead of a permanent sidebar, with Operations exposed as contextual
  Actions and Schema as a secondary floating affordance.

  Reflect statically authorized Entity mutation fields and actions into Explorer so scalar cells can
  be edited inline and exact rows can be deleted through the remote graph Command boundary.

- c9565cb: Let identified Entity rows open non-blocking instance windows with reflected scalar values,
  portable Reference links, and direct or inverse related instances. Multiple windows can remain
  expanded for comparison or collapse in place into compact canvas nodes. Related Queries now run only
  for open instances instead of once per visible row and Relation. The Explorer-level workspace
  preserves mixed-Entity expanded and collapsed nodes across Entity and query navigation without
  using browser storage, including when following Reference or related-instance links; navigating to
  an already open instance restores it, while related rows open as another window. The workspace
  rehydrates a collapsed row when it is expanded. Windows use their content height and become
  internally scrollable only when they reach the available viewport height. Expanded headers and
  compact nodes share one drag surface and positioning model; positions remain in the ephemeral
  workspace across activation, Entity navigation, collapse, and expansion, while the active node
  comes to the front. Authorized Fields share type-aware table and window editors for booleans,
  enums, numbers, dates, JSON, nullable values, colors, and References, and authoritative data is
  re-read after a mutation succeeds.

  Reference values in tables and instance windows now resolve the authorized target instance and
  render its reflected primary and secondary display fields. Portable locators remain the navigation
  identity, tooltip, and safe fallback when the target cannot be resolved.

  Authorized many-to-many policies now project `add` and `remove` Relation affordances into the
  Explorer snapshot. Instance windows consume those affordances through a searchable participant
  picker and compact unlink controls, execute canonical Relationship Commands, and refresh related
  data from the server after each applied outcome.

- 71b3d4d: Add named portable Domain Operation input conditions backed by canonical Model Expression IR.
  Codegen compiles natural Ref-identity expressions without executing callbacks, emits one condition
  registry shared by server and generated clients, and reports unsupported syntax at its source.
  Core evaluates conditions authoritatively before the body and exposes tri-state advisory
  evaluation, dependencies, conventional rejection, reflection, and an explicit runtime-only
  builder. Explorer presents reflected condition names.

  Callback-valued top-level `contracts.pre` and `contracts.post` are removed during the alpha. Move
  arbitrary server-only checks to `contract({ pre, post })` in `concerns`; top-level
  `contracts.pre` now accepts named portable conditions.

- 015893f: Keep schema-only Entities in generated clients and add reflected Entity creation to the Explorer.

  Expose forward and inverse related-instance reads, counts, and drill-downs through in-memory and
  PostgreSQL storage, the Ontahi application runtime, Express, and the default React fetch client.
  Make the in-memory Data Graph runtime transactional so atomic Operations have the same local
  execution contract as transactional adapters.

- ea87f14: Add reflected atomic Domain Operations with `operation.atomic(...)`. Core derives the Data Graph
  atomicity requirement, the server runner owns the complete transaction boundary, generated clients
  preserve the contract, and React/Explorer report whether the current runtime can execute locally,
  bridge to an authority, or cannot satisfy the requirement.

### Patch Changes

- Updated dependencies [82654bc]
- Updated dependencies [0544f8b]
- Updated dependencies [2ed9511]
- Updated dependencies [926919d]
- Updated dependencies [a5d07f1]
- Updated dependencies [3069b93]
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
  - @ontahi/react@1.0.0-alpha.9

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
