# @ontahi/supabase

## 1.0.0-alpha.18

### Patch Changes

- Updated dependencies [e91ded6]
- Updated dependencies [a3c8aa9]
- Updated dependencies [823e87f]
  - @ontahi/core@1.0.0-alpha.18

## 1.0.0-alpha.17

### Patch Changes

- 59bb878: Apply receiver-owned Graph Read policy scopes to nested Relation populations before ordering,
  limits, and materialization across the in-memory, PostgreSQL, MySQL, and Supabase runtimes.
- Updated dependencies [0f5b417]
- Updated dependencies [59bb878]
- Updated dependencies [dd8cba4]
- Updated dependencies [0454782]
  - @ontahi/core@1.0.0-alpha.17

## 1.0.0-alpha.16

### Patch Changes

- Updated dependencies [ec78c01]
- Updated dependencies [7eac013]
- Updated dependencies [35f8e2d]
- Updated dependencies [1ad6d42]
  - @ontahi/core@1.0.0-alpha.16

## 1.0.0-alpha.15

### Patch Changes

- Updated dependencies [471e2e4]
- Updated dependencies [d87afb3]
  - @ontahi/core@1.0.0-alpha.15

## 1.0.0-alpha.14

### Minor Changes

- d1fab2d: Add `createSupabaseDataGraphStorage` to assemble conventional mappings, graph execution, and
  reflected Entity readers around one host-owned Supabase client.

### Patch Changes

- Updated dependencies [d1fab2d]
- Updated dependencies [fa7968e]
  - @ontahi/core@1.0.0-alpha.14

## 1.0.0-alpha.13

### Minor Changes

- 5b13c9a: Persist explicit Task execution checkpoints so registered named-step Operations can resume pending
  interactions in a new in-process runtime. Store checkpoints in the Supabase task adapter and keep
  the private execution state out of public Task snapshots.
- 27d5253: Add opt-in Runtime Protocol metadata for committed semantic mutations from Graph Commands,
  Operations, and terminal durable Operations. Hosts must explicitly project metadata for the
  caller's authority, while receivers that do not advertise the capability keep the previous
  response shape.

  Durable Task execution now owns an isolated mutation journal and persists accumulated execution
  metadata across human-in-the-loop resumes. Supabase Task stores persist this optional metadata in
  an `execution_metadata` JSON column when a Task commits graph mutations.

- 2817f0c: Harden Supabase Task Storage with an invoker-rights PostgreSQL RPC for atomic Interaction claims,
  Event-wait claims, and cancellation. Export the installable RPC SQL and verify the complete shared
  Task Storage contract, concurrent claims, restart persistence, and RLS behavior through real
  PostgREST and PostgreSQL containers.

### Patch Changes

- 116f3ea: Expose payload-free Event resume evidence on durable Task snapshots. Native Task observations now
  retain the Event wait, occurrence, delivery claim, and ingress provenance needed to explain a
  restart-safe continuation without exposing the Event payload.

  Devtools renders the Event wait, ingress-driven resume, and Task completion as one causal Operation
  activity with expandable JSON details.

- 3fdc296: Represent a Task suspended on a typed Interaction with an explicit `waiting` lifecycle state.
  Native and LangGraph execution now return to `running` only after one authorized, correlated
  response is atomically claimed, including after runtime recreation.

  Preserve waiting snapshots through Runtime Protocol transports, expose `isWaiting` from
  `useDurableOperation`, and keep observation active until the run reaches a terminal state.

- 6b3f847: Add durable, correlated Event waits to native Task executions. Task snapshots now describe their
  typed waiting reason, retained Event deliveries resume a persisted continuation once across runtime
  recreation, and waits can time out or be cancelled without deleting the occurrence. Supabase Task
  storage implements the corresponding atomic wait claim and cancellation transitions.

  Durable Event waits are currently supported only by the native Task Runtime. LangGraph fails
  explicitly when it encounters this transition until it can provide equivalent durable semantics,
  instead of incorrectly treating the wait as an ordinary continuation.

- Updated dependencies [45e3083]
- Updated dependencies [7a9bb92]
- Updated dependencies [69ccf41]
- Updated dependencies [b862f5b]
- Updated dependencies [116f3ea]
- Updated dependencies [5f213e4]
- Updated dependencies [a35b2d0]
- Updated dependencies [8a7eaec]
- Updated dependencies [7eaddca]
- Updated dependencies [31b5311]
- Updated dependencies [0802a01]
- Updated dependencies [03c1af6]
- Updated dependencies [7d002a0]
- Updated dependencies [3fdc296]
- Updated dependencies [c275332]
- Updated dependencies [f335200]
- Updated dependencies [db4b8c9]
- Updated dependencies [399f7f5]
- Updated dependencies [f5e085f]
- Updated dependencies [fb78b34]
- Updated dependencies [9e769f6]
- Updated dependencies [f67fa6f]
- Updated dependencies [2305a9d]
- Updated dependencies [c01cd23]
- Updated dependencies [7c2a6b9]
- Updated dependencies [c275332]
- Updated dependencies [8ab4218]
- Updated dependencies [fb78b34]
- Updated dependencies [c275332]
- Updated dependencies [b807692]
- Updated dependencies [ddec3e7]
- Updated dependencies [3252d6c]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [f552bed]
- Updated dependencies [c275332]
- Updated dependencies [c275332]
- Updated dependencies [5668f96]
- Updated dependencies [5ea8abd]
- Updated dependencies [96d8092]
- Updated dependencies [5b13c9a]
- Updated dependencies [6d3a494]
- Updated dependencies [f552bed]
- Updated dependencies [67fc06a]
- Updated dependencies [eebeeec]
- Updated dependencies [8ff883f]
- Updated dependencies [e114d60]
- Updated dependencies [d1d3f36]
- Updated dependencies [82d155a]
- Updated dependencies [072ad16]
- Updated dependencies [6b3f847]
- Updated dependencies [27d5253]
- Updated dependencies [a2fb2b5]
- Updated dependencies [848b50d]
- Updated dependencies [24d99ef]
- Updated dependencies [9904cff]
  - @ontahi/core@1.0.0-alpha.13

## 1.0.0-alpha.12

### Minor Changes

- f16a848: Support contextual Selection reads through native PostgREST existence filters, including nested/self hasMany navigation, belongs-to and mapped many-to-many membership. Pass the complete receiver-owned Entity registry to the Supabase runtime. Source membership stays in the database, with independent filters and RLS per hop; final projections, count, exact-one checks and buffered streams reuse the same membership plan. Graph Read v2 hosts can explicitly enable relational Selections with per-hop policies. Physical foreign keys must match declared mappings; unsupported identifiers, inverse self-navigation, composite edges and virtual filter fields remain closed.

  Fix Boolean negation serialization to valid PostgREST logic syntax, including scalar negation and nested contextual complements.

### Patch Changes

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

## 1.0.0-alpha.11

### Patch Changes

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
- 2242b00: Add portable `relationConstraint.countAtMost(...)` metadata and prospective in-memory enforcement
  for direct to-many Relations. PostgreSQL now serializes competing additions on the destination
  endpoint before evaluating the aggregate from a fresh transaction snapshot, while Supabase fails
  closed until its RPC can provide the same authority-serialized guarantee.
- f73b2cb: Add direct Supabase execution for portable exact Entity Mutation Commands. Registered Entities now
  support create, Ref-targeted update, and Ref-targeted delete through existing PostgREST mapping and
  RLS boundaries, returning exact portable deltas and structured cardinality evidence.

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

- ca98ccd: Execute direct Relationship Commands through an atomic invoker-rights Supabase RPC, and resolve
  constrained inverse `hasMany` Relations from a unique target `belongsTo` field when `via` is omitted.
- f579e0f: Resolve direct Relation constraints against canonical participants and enforce portable
  source/target eligibility atomically across PostgreSQL and Supabase direct and many-to-many
  Relationship Commands, preserving structured rejection descriptors without partial edge changes.

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
