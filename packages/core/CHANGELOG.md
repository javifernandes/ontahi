# @ontahi/core

## 1.0.0-alpha.12

### Minor Changes

- 14026dd: Add a capability-validating, inspectable Runtime Transport router and let Devtools derive its own
  generic transport Settings from that runtime. Use the Ontahí ceibo mark for the launcher, project
  Operation inputs and returned values without Runtime Protocol wrappers in Visual detail, and present
  the panel as a full-width, vertically resizable bottom drawer.
- 6770db7: Register Entity variants on base Graph Read policies and discover them as Console roots in both
  TS and declarative dialects. The receiver enforces classification outside caller predicates and
  inherits base authorization, limits and canonical identity. Console metadata discovery provides
  shared root, Field, narrowed enum and named-factory autocomplete before any data query, with
  ordering permissions and catalog invalidation scoped to the active transport and identity.
- 6770db7: Declare classified contextual Selection targets with `self.nodes.as(Part)` and compose read-only
  paths such as `Book.parts.chapters`. Generated clients preserve narrowed types and portable
  contracts. Both Console dialects discover and autocomplete the final target, using its ordering
  permissions. Graph Read v2 enforces registered classification and base authority scopes at every
  nested source and final target without changing canonical identity or granting extra permissions.
- 40b6e3c: Add opt-in Graph Read v2 request/response support for contextual Selection membership. Receivers
  must enable relationSelections and grant each outgoing selectionRelations hop separately from
  View/include permissions. Each source and final target uses its own policy scope, outside caller
  boolean expressions. Discovery advertises advisory v2 capability and outgoing grants.

  Keep v1 serialization, default low-level receivers and graph observation closed to
  relation-image requests. This slice does not enable Commands or add Console syntax.

- 40b6e3c: Connect contextual Selection reads through application storage and remote clients. In-memory and
  PostgreSQL storage declare graphReadCapabilities.relationSelections, which enables application
  Graph Read v2 receivers while retaining explicit per-hop policy grants.

  Remote and React graph clients discover the target's v2 capability before each contextual read,
  using the same transport options for metadata and execution. Ordinary reads stay v1 with no
  extra requests; missing capabilities and read denials never fall back to v1 or prefetch IDs.

  Custom RemoteGraphReadTransport implementations now accept GraphReadFamilyRequest (metadata and
  v1/v2 reads); narrow by kind before reading mode or selection. Contextual observation remains
  unsupported pending source-change invalidation.

- 40b6e3c: Add experimental deferred relation-image membership, Selection.through and parameterless contextual
  Selection factories. Selection schemas validate source paths against explicit receiver-owned model
  definitions, and in-memory reads evaluate composed navigation before final read shaping. Commands,
  graph read protocol v1 and SQL explicitly reject this membership until their corresponding support
  is implemented. Entities can declare parameterless contextual selections with
  `selections: ({ self }) => ({ parts: self.contentNodes.where(node => node.type.eq('part')) })`.
  Selection properties preserve deferred membership and target types through composition and runtime
  binding. Discovery exposes copied contracts; codegen compiles supported declarations to portable
  data for generated clients. Language/UI authoring and remote execution remain follow-up work.
- 65e6d30: Add native ordered `hasMany` Relations with portable move commands, exact neighborhood conflict
  checks and deltas, natural ordered reads, in-memory and transactional PostgreSQL execution,
  Fetch/WebSocket transport support, React hooks, reflection, and semantic Devtools summaries.
- ced6a65: Add transport-neutral Query observation to runtime-bound reads and an in-memory implementation that
  emits complete current results after successful graph commits. Add a framework-owned TaskRun Entity
  and native in-process Task lifecycle observation backed by that Query capability. Project authorized
  Query observations through Runtime Protocol WebSocket sessions, reconcile pushed snapshots through
  the Graph Client Cache, and let Express hosts install a receiver-owned Graph observer. Adapt native
  TaskRun streams into Durable Protocol progress so WebSocket hosts can push task lifecycle snapshots
  without polling while preserving the existing Durable client API. Preserve public EntityRef input
  inference when a schema-backed durable operation is consumed through React.
- cfca984: Expose opt-in, policy-derived ordering capabilities on successful Graph Reads and use them to
  enable Console result headers. Explain unavailable ordering without sending denied header actions,
  and refresh advisory permissions after transport replacement or policy rejection.
- 740cfd0: Add experimental data-first named Selection factories alongside existing locators. Declare scalar
  input schemas and pure predicate/canonical-identity templates with `withSelectionFactories`, then
  use typed `Entity.by({ factoryName: inputs })` on the definition or its client facade. Preserve
  portable membership, explicit identity, consumer cardinality, and ordinary receiver authorization.
  Expose declaration and original invocation metadata separately from execution ASTs; no fetch,
  external resolver, locator deprecation, or remote Command protocol change is introduced.

  Apply the consumer's one/many contract when normalizing an already constructed Selection input,
  without mutating the caller's Selection. Previously that path preserved the caller's cardinality
  and could bypass an Operation's exact-one mutation requirement.

- 6770db7: Bind classified Selections to the current runtime without adding mutation capabilities. Preserve
  read execution through classified contextual hops, membership composition, ordering, limits and
  terminal read intents. Explicit `toQuery()` lowering retains the base Entity's canonical cache
  identity and existing provider boundaries.
- 740cfd0: Expose named Selection factory contracts in graph discovery: strict input schemas, Selection output
  entity, version, shorthand and pure expansion template. Preserve consumer-owned cardinality.
  Generate typed browser factories from portable withSelectionFactories declarations without server
  imports, and show discovered contracts in Explorer's Entity structure panel. Existing locators
  remain supported; Console grammar and dynamic factory invocation forms are not introduced here.
- 5d9f605: Present cached outputs using semantic read and operation names, selection summaries, and visible identity scopes. Keep complete cache keys in an expandable JSON view. Graph and operation query hooks attach optional descriptive source metadata to output records; this metadata does not confer freshness or change reconciliation policy.
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
- 5af84ba: Unify Fetch Operation, Graph Read, Graph Command, and Durable inspection clients behind one Runtime Transport and `/runtime` endpoint by default, with correlated family exchanges and explicit per-family legacy endpoint compatibility.
- 96629f2: Add a versioned WebSocket Runtime Protocol session, a multiplexed browser Runtime Transport with
  pushed Durable Operation progress, and an Express server projection with receiver-owned session
  context and host-controlled upgrade authorization. Schema-backed Operation inputs are made
  portable before either Fetch or WebSocket Runtime Protocol transmission.

### Patch Changes

- 6770db7: Allow contextual factories to target variants declared before their base entity is enriched with
  relations or contextual selections. Preserve narrowed destination types while still requiring the
  exact same base object at runtime, so root and nested classified navigation compose without casts.
- 6770db7: Support experimental `graphSchema.existingRef(Variant)` Operation inputs using canonical base
  Refs. The receiver checks the resolved record's classification, identity and base schema before
  entering the Operation body, including custom resolvers. Reflect the variant contract separately
  from base identity in schema descriptors and JSON Schema. Stored variant Reference Fields remain
  unsupported.
- 6770db7: Release idle remote Graph observation subscriptions by aborting their lifetime signal before
  waiting for iterator closure. Forward cancellation through the React Runtime Transport bridge
  without changing caller options or other subscriptions. Verify classified membership changes,
  shared canonical cache identity and host-driven React query invalidation across real provider reads.
- a8e1dbc: Reopen Console completion after accepting ordering and predicate clauses so their Fields appear
  without another keystroke. Discover receiver-owned ordering permissions through a metadata-only
  graph.read request before executing data, with loading/error feedback and retry. Share that policy
  snapshot between completion, source-backed field/direction dropdowns in both dialects, and result
  headers. Preserve keyboard editing and undo, and invalidate stale metadata when Entity, transport,
  graph.read routing, or host-provided ExecutionIdentity changes. Identity changes clear prior Console
  results and cancel pending reads without discarding the draft or undo history. Support discovery through Runtime Protocol and standalone Express
  and Next.js Graph Read handlers; ordinary reads and observations retain their existing contracts.
- cfca984: Preserve Console member names as contextual identifiers in Selection fields and Entity names.
  Report structured cardinality mismatches for implicit get cardinality. Simplify Console analysis
  and result rendering while retaining source-backed controls and native accessible result status.
- 740cfd0: Support reflected named Selection factories in TS-like and declarative Console reads. Share pure
  schema-validated expansion with Core, complete factory names and inputs, and preserve authored
  invocations during dialect conversion and result-table ordering/limit edits. One factory can be
  combined with a where predicate and the existing read terminals; receiver authorization is unchanged.
- 6770db7: Add experimental fixed-enum Entity variants as local read universes. Compose all/where, declared
  base by factories, canonical references, and explicit contextual narrowing with complement and
  union constrained to the variant. Reads retain the base identity/storage and narrowed row types.
  Companion changes add existingRef Operation inputs, discovery, and Graph Read transport.
  Variant-specific writes remain unsupported.
- 40b6e3c: Validate exact-one Selection membership before read limits, including policy-imposed limits and
  related-root reads. PostgreSQL and MySQL probe for a second match in the same SQL statement;
  Supabase requests an exact count with the rows so server row caps cannot masquerade as uniqueness.
  Supabase exact-one reads fail closed when exact count metadata is unavailable.

  Enforce the same cardinality contract for counts, reject contradictory exact-one reads with
  `limit(0)`, and preserve cardinality diagnostics through Effect-backed read dispatchers. Nullable
  first-result and existence intent, many-result shaping, and atomic mutation semantics are unchanged.

- b81adfe: Add MySQL 8.4/InnoDB storage with exact CRUD results, explicit-target upsert, primary-key updates,
  Entity Mutation deltas, direct/many-to-many/ordered Relationship Commands, transactions, command
  savepoints, and reflected Entity data. Include concurrent constraint tests and a Todo Express
  configuration with persistence verified across host restarts.

  Extract shared mappings, query compilation, and read materialization into @ontahi/sql while
  preserving PostgreSQL's public entrypoints and provider-owned mutation implementation.

  Preserve explicit relation mappings during Core application composition so physical join mappings
  remain available to the storage adapter. Date/time, JSON, large-number conformance, and broader
  schema diagnostics continue separately in Plan 151b.

- cfca984: Explain Graph Read ordering policy rejections with the requested Entity and Field, preserving the
  stable access_denied code and adding optional structured ordering_not_allowed details. Other
  authorization failures remain generic, and no read permissions are broadened.
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

- 8e627d2: Harden WebSocket Runtime sessions by bounding completed request identity retention, releasing
  observation and socket resources deterministically, reporting handshake send failures, and making
  Express upgrade-boundary ownership explicit.

## 1.0.0-alpha.11

## 1.0.0-alpha.10

### Minor Changes

- a389b29: Add explicit Operation receiver metadata and project only receiver-bound operations onto Entity
  table rows and instance windows. A row exposes its sole action directly and uses the compact action
  menu when several operations bind to that instance, while relation creation remains contextual and
  preserves bound inputs, destructive confirmation, and refresh after execution.
- 36f16e8: Allow scalar Entity fields to declare a reusable semantic value type with `field.named`. Reflected
  Entity data and operation schemas preserve that type so Explorer controls can be selected from the
  domain model instead of field-name conventions. The Todo example now declares `Color` this way,
  and Explorer renders it with a color picker while simplifying required one-Entity selections.

## 1.0.0-alpha.9

### Minor Changes

- 82654bc: Add `application.graph.read(...)` as the typed headless host boundary for plain Queries, Views,
  `first`, `one`, `count`, and `exists`. Reads automatically enter the server execution context and
  pin the storage runtime configured by that exact application while preserving View parameters and
  provider read options.
- 0544f8b: Add typed `if` conditions to exact Ref-targeted Entity update/delete Commands. In-memory,
  PostgreSQL, Supabase, and remote execution apply identity and authorized equality conditions in one
  atomic mutation, return one authority-safe rejection when it does not apply, and use a fail-closed
  wire version so older servers cannot silently execute an unconditional mutation.
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
- a5d07f1: Add typed exact Entity mutation authoring to generated client facades through `Entity.create(...)`
  and Ref-bound `update(...)` / `delete()`, with runtime-bound `.run()` execution while portable
  Commands and Refs remain data-only. Exact update/delete deltas retain the requested Ref and reject
  a response for another instance of the same Entity.
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

- 31878c3: Bridge portable identity-scoped Entity Mutation Commands through a versioned default-deny remote
  boundary. Create, exact update, and exact delete now execute through PostgreSQL and Fetch with
  server-owned schema validation, explicit per-action mutation/result Field allowlists, exact deltas,
  and structured cardinality rejections.
- caf7b08: Add a transport-neutral Runtime Protocol dispatcher that validates and routes Operation, Graph
  Read, and Graph Command envelopes while preserving family semantics and receiver-owned context.
- 5a9246f: Add the first transport-independent Ontahí Runtime Protocol envelope and typed family registry,
  with fail-closed adapters for the existing versioned Graph Read and Graph Command request bodies.
- 8def4c1: Add a transport-neutral Runtime Transport with asynchronous Durable Operation observation. The
  Fetch implementation sends versioned `durable.operation.inspect` requests and owns polling and
  abort behavior, React hooks consume snapshots without selecting a delivery strategy, and Express
  can project an explicitly configured Runtime Protocol dispatcher at one host-owned path.
- 2242b00: Add portable `relationConstraint.countAtMost(...)` metadata and prospective in-memory enforcement
  for direct to-many Relations. PostgreSQL now serializes competing additions on the destination
  endpoint before evaluating the aggregate from a fresh transaction snapshot, while Supabase fails
  closed until its RPC can provide the same authority-serialized guarantee.
- ea87f14: Add reflected atomic Domain Operations with `operation.atomic(...)`. Core derives the Data Graph
  atomicity requirement, the server runner owns the complete transaction boundary, generated clients
  preserve the contract, and React/Explorer report whether the current runtime can execute locally,
  bridge to an authority, or cannot satisfy the requirement.
- 58fcaae: Add a versioned Durable Operation observation protocol with portable inspect requests, normalized
  Task snapshots, family errors, registry support, and common Runtime Protocol dispatch.
- 3a3119b: Add the versioned `operation` Runtime Protocol family for portable invocation and permission
  requests, plus the canonical registry tuple shared with Graph Read and Graph Command.

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
- 213f4ec: Add declarative application-registered Relationship Reactions, typed matcher and intent factories,
  observable applied outcomes, and transaction-aware post-commit interpretation for bound commands.
- 2d526f3: Reflect semantic Relation descriptors, render portable Entity references as navigable identity, and
  support read-only related-instance panels through a host-provided Query-backed reader. Schema
  reflection also exposes undeclared inverse endpoints as non-executable, read-only topology.
- 0ad7a06: Enforce portable source and target participant constraints atomically across Selection-valued
  many-to-many Relationship Commands.
- 4dd7be4: Add server UnitOfWork scopes, contextual Data Graph transactions, and runtime-bound Relationship
  Command `.run()` execution while preserving portable command serialization.
- 0247a29: Add conditional to-one Relation assignment with portable expected-current target preconditions.
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

- f3f292c: Add typed factories for portable Relation source/target participant constraints, stable rejection
  descriptors, static reflection, and authoritative in-memory Relationship Command enforcement.
- ca98ccd: Execute direct Relationship Commands through an atomic invoker-rights Supabase RPC, and resolve
  constrained inverse `hasMany` Relations from a unique target `belongsTo` field when `via` is omitted.
- f579e0f: Resolve direct Relation constraints against canonical participants and enforce portable
  source/target eligibility atomically across PostgreSQL and Supabase direct and many-to-many
  Relationship Commands, preserving structured rejection descriptors without partial edge changes.
- 302e4d3: Add operation-scoped UnitOfWork Ref resolution reuse and explicit invalidation, including
  transparent memoization for authorized Data Graph input Ref Queries.

## 0.1.0-alpha.7

### Minor Changes

- 9f5aff6: Author structural Relationship Commands directly from typed Entity Refs with cardinality-specific
  relation methods such as `student.course.assign(course)` and `course.students.add(student)`.

## 0.1.0-alpha.6

### Minor Changes

- 221c150: Add a versioned JSON protocol for Relationship Commands with server-owned topology and Ref
  validation.
- 221c150: Add canonical Relationship Commands and in-memory applied deltas, and validate required fields
  during generic Entity construction.
- 221c150: Add direct and remote runtime routing for canonical Relationship Commands.
- 5e4217d: Bind generated client Entity facades to direct or Fetch-backed runtimes for fluent Query execution
  outside React hooks while preserving their portable Views, Refs, and Domain Operations.
- 221c150: Add a default-deny Relationship Command policy and transport-neutral dispatcher.
- 221c150: Add transport-neutral Applied Mutation Outcomes and bounded post-commit Relationship Reactions with
  explicit causal identity, delivery policy, durable acceptance, and failure evidence.

  Add exact Entity create, update, and delete intents with applied deltas and in-memory execution.

  Add direct many-to-many Relations with Selection-valued endpoints, exact Cartesian deltas,
  default-deny dispatch, and direct or remote in-process execution.

## 0.1.0-alpha.5

### Minor Changes

- d48cab0: Add portable generated-client Query entry points, explicit read intents, shared execution identity,
  canonical identity-scoped React query keys, a conventional Fetch graph client, and bound
  first-class Operation invocation hooks.
- 7b4c9dc: Add a transport-neutral remote data graph runtime that executes `get`, `run`, and `count` through
  the versioned read protocol while keeping authority and credentials outside the graph request.
  Preserve structured protocol, response, transport, and unsupported-capability failures so remote
  Commands and streams remain explicitly unavailable until their protocols are implemented.
- b8765da: Expose a versioned JSON-safe data graph read request that preserves Selection, View, ordering,
  limit, cardinality, and read mode and can be rebuilt against server-owned Entity definitions. Add
  a transport-neutral, default-deny dispatcher with recursive field, filter, ordering, relation,
  cardinality, limit, and authority-scope policy enforcement. Export canonical object and JSON value
  helpers used by protocol boundaries.
- 48278b4: Add a Fetch-backed React graph-read executor, preserve typed Effect failures across the browser
  Promise boundary, and let Express applications expose policy-scoped reads from their configured
  application storage and invocation context without constructing a dispatcher manually.

### Patch Changes

- 21a8693: Expose recursive caller-owned View authoring directly from generated client Entity facades.

## 0.1.0-alpha.4

### Minor Changes

- 74dac66: Add recursive, typed entity Views with a finite JSON-safe AST that preserves relation identity,
  direction, target, cardinality, and nullability.
- be2af8f: Allow recursive entity Views to project Queries and local Selections with `.as(view)`.
- d46a878: Add final Query inspection for projectable Operations and validate reflected View relation metadata.
- 9cfa0bc: Carry recursive Views through projectable Operation invocations and expose typed `.as(view)`
  results to React Operation queries.
- 8321558: Add lazy projectable calls for Operations that return semantic entity Selections.

## 0.1.0-alpha.3

### Minor Changes

- 04b573a: Add opt-in, JSON-safe internal operation error causes for development diagnostics while keeping
  transported failures sanitized by default. Preserve transported operation failures as serializable
  React error causes.

## 0.1.0-alpha.2

### Patch Changes

- dfd0ddc: Resolve reference-field includes from semantic identity metadata so in-memory data graphs do not
  require physical storage mappings.

## 0.1.0-alpha.1

### Minor Changes

- 451eda5: Add a provider-neutral authentication Principal, invocation-scoped auth APIs and requirements, and
  Express and Next.js request hooks for supplying invocation context without coupling Ontahi to an
  identity provider.
