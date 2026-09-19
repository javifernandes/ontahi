# @ontahi/codegen

## 1.0.0-alpha.12

### Minor Changes

- 6770db7: Declare classified contextual Selection targets with `self.nodes.as(Part)` and compose read-only
  paths such as `Book.parts.chapters`. Generated clients preserve narrowed types and portable
  contracts. Both Console dialects discover and autocomplete the final target, using its ordering
  permissions. Graph Read v2 enforces registered classification and base authority scopes at every
  nested source and final target without changing canonical identity or granting extra permissions.
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
- 65e6d30: Add native ordered `hasMany` Relations with portable move commands, exact neighborhood conflict
  checks and deltas, natural ordered reads, in-memory and transactional PostgreSQL execution,
  Fetch/WebSocket transport support, React hooks, reflection, and semantic Devtools summaries.
- 740cfd0: Expose named Selection factory contracts in graph discovery: strict input schemas, Selection output
  entity, version, shorthand and pure expansion template. Preserve consumer-owned cardinality.
  Generate typed browser factories from portable withSelectionFactories declarations without server
  imports, and show discovered contracts in Explorer's Entity structure panel. Existing locators
  remain supported. Console authoring consumes these contracts; dynamic Explorer factory invocation
  forms remain deferred.

### Patch Changes

- d293ff1: Project Operation wire input schemas without copying or executing server-side transform and refinement
  callbacks. Preserve raw caller types, nested Values and server-processing metadata in analysis, while
  leaving parsing and authoritative validation in the receiving runtime. Server-only Value inventory no
  longer requires browser portability. Transformed outputs still require an explicit portable result
  schema instead of pretending the pre-transform input describes the result.
- d293ff1: Project declarative recursive `graphSchema.lazy` Value factories into generated clients. Generated schemas retain recursive validation and inferred types without copying server types or executing host closures. Only zero-argument expression factories returning a Value with the same literal name are supported; opaque factories still fail generation.
- 6770db7: Generate named Value Operation inputs containing direct existingRef variant participants, including
  imported input aliases. Preserve the Value name, shared declaration, canonical base identity and
  classification metadata without copying server resolvers into browser code. Portable variant refs
  and conditions over classified inputs remain unsupported.

  Compile parameterless isNull() predicates in contextual declarations, allowing classified root
  navigation to preserve its null-parent constraint in the generated client.

- d293ff1: Close named Value schema dependencies in generated clients, including imported aliases, nested
  Values, shared fields, and receiver-bound Entity schemas. Preserve shared Value identity and
  report unresolved, cyclic, conflicting, or opaque schema dependencies instead of emitting broken
  browser modules or copying host code.
- d293ff1: Include schema-native `ref` and `existingRef` Operation inputs when generating selection-mode client contracts. These reference-input Operations retain both input and output contracts, preserving participant inputs and typed query results instead of dropping them from the browser facade. Existing Selection-only projection behavior is unchanged.
- 6770db7: Expose graph-native Operation input descriptors in graph discovery. Project static classified
  existingRef inputs to browser-safe schemas while preserving base Ref identity and the classification
  requirement, including imported variants and optional/nullable fields. Do not emit server resolvers.
  Diagnose missing generated base schemas and unsupported declaration shapes. Preserve shorthand
  Operation input declarations instead of silently omitting them from generated clients.
- 6770db7: Reject unsupported nested classified Operation participants during code generation, matching the
  runtime's direct object/Value field contract (including optional/nullable wrappers).

  Require a declared canonical base identity for existingRef variant targets. Validate the complete
  identity locator before resolution, including composite identities; alternate or incomplete
  locators report invalid input instead of a misleading entity-not-found failure.

- d293ff1: Close browser output-schema dependencies through wrappers such as nullable, array, union and named,
  including imported aliases and shared Values. Generated outputs preserve their inferred types and
  schema identity. Requesting an anonymous output that cannot be safely projected now reports its
  Operation and the unsupported dependency instead of emitting an invalid browser module.

## 1.0.0-alpha.11

## 1.0.0-alpha.10

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

## 1.0.0-alpha.8

## 0.1.0-alpha.7

## 0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- 140332b: Generate client Entity schema imports, declarations, and relations through the TypeScript AST emitter with deterministic printer formatting.
- 140332b: Generate task-definition registries through the TypeScript AST emitter, with deterministic printer formatting.
- 140332b: Reject syntactically invalid TypeScript sources before codegen analyzes recovered declarations.
- 4302929: Expose a serializable nominal definition inventory, report conflicting Entity and Value names during application analysis, and reuse each named Value across generated Operation contracts.
- 6ba88f1: Project every graph entity schema referenced by a named Value operation output into generated browser clients.

## 0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- face827: Add a conventional `ontahi-codegen` executable for browser client generation, drift checks, and
  watch mode so standard applications no longer need to copy a custom generation script.

## 0.1.0-alpha.2

## 0.1.0-alpha.1
