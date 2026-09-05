# @ontahi/runtime-express

## 1.0.0-alpha.12

### Minor Changes

- ced6a65: Add transport-neutral Query observation to runtime-bound reads and an in-memory implementation that
  emits complete current results after successful graph commits. Add a framework-owned TaskRun Entity
  and native in-process Task lifecycle observation backed by that Query capability. Project authorized
  Query observations through Runtime Protocol WebSocket sessions, reconcile pushed snapshots through
  the Graph Client Cache, and let Express hosts install a receiver-owned Graph observer. Adapt native
  TaskRun streams into Durable Protocol progress so WebSocket hosts can push task lifecycle snapshots
  without polling while preserving the existing Durable client API. Preserve public EntityRef input
  inference when a schema-backed durable operation is consumed through React.
- 96629f2: Add a versioned WebSocket Runtime Protocol session, a multiplexed browser Runtime Transport with
  pushed Durable Operation progress, and an Express server projection with receiver-owned session
  context and host-controlled upgrade authorization. Schema-backed Operation inputs are made
  portable before either Fetch or WebSocket Runtime Protocol transmission.

### Patch Changes

- 8e627d2: Harden WebSocket Runtime sessions by bounding completed request identity retention, releasing
  observation and socket resources deterministically, reporting handshake send failures, and making
  Express upgrade-boundary ownership explicit.
- Updated dependencies [ced6a65]
- Updated dependencies [5af84ba]
- Updated dependencies [96629f2]
- Updated dependencies [8e627d2]
  - @ontahi/core@1.0.0-alpha.12
  - @ontahi/explorer-react@1.0.0-alpha.12

## 1.0.0-alpha.11

### Patch Changes

- @ontahi/core@1.0.0-alpha.11
  - @ontahi/explorer-react@1.0.0-alpha.11

## 1.0.0-alpha.10

### Patch Changes

- Updated dependencies [0e27355]
- Updated dependencies [6f22cfe]
- Updated dependencies [a389b29]
- Updated dependencies [36f16e8]
- Updated dependencies [f903bee]
- Updated dependencies [36f16e8]
  - @ontahi/explorer-react@1.0.0-alpha.10
  - @ontahi/core@1.0.0-alpha.10

## 1.0.0-alpha.9

### Minor Changes

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

- 015893f: Keep schema-only Entities in generated clients and add reflected Entity creation to the Explorer.

  Expose forward and inverse related-instance reads, counts, and drill-downs through in-memory and
  PostgreSQL storage, the Ontahi application runtime, Express, and the default React fetch client.
  Make the in-memory Data Graph runtime transactional so atomic Operations have the same local
  execution contract as transactional adapters.

- 31878c3: Bridge portable identity-scoped Entity Mutation Commands through a versioned default-deny remote
  boundary. Create, exact update, and exact delete now execute through PostgreSQL and Fetch with
  server-owned schema validation, explicit per-action mutation/result Field allowlists, exact deltas,
  and structured cardinality rejections.
- 8def4c1: Add a transport-neutral Runtime Transport with asynchronous Durable Operation observation. The
  Fetch implementation sends versioned `durable.operation.inspect` requests and owns polling and
  abort behavior, React hooks consume snapshots without selecting a delivery strategy, and Express
  can project an explicitly configured Runtime Protocol dispatcher at one host-owned path.

### Patch Changes

- Updated dependencies [82654bc]
- Updated dependencies [0544f8b]
- Updated dependencies [2ed9511]
- Updated dependencies [926919d]
- Updated dependencies [a5d07f1]
- Updated dependencies [3069b93]
- Updated dependencies [c9565cb]
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
  - @ontahi/explorer-react@1.0.0-alpha.9

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
