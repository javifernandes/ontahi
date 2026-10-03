# @ontahi/devtools

## 1.0.0-alpha.13

### Minor Changes

- 399f7f5: Expose the Entity and Field positions occupied by named Graph Read application Holes so resolvers
  and frontend projections can derive binding semantics from registered schemas.

  Project direct Entity Ref predicate Holes in the Semantic Console as searchable, receiver-authorized
  choices and substitute the selected candidate as a canonical Entity Ref before execution.
  Render Boolean Holes as explicit choices, align every binding in a stable parameter grid, and expose
  available Field descriptions as contextual help.
  Normalize or clear retained bindings when an edited expression changes a Hole's projected control
  type so the visible control and executable request stay consistent.

- ddec3e7: Allow model-command runtimes to propose canonical Graph Reads, execute them through the configured
  policy-aware dispatcher, and return their actual results. Render the canonical read and semantic
  result together in Devtools Activity.
- 3252d6c: Add the versioned `model.command` Runtime Protocol family for natural-language requests and return
  the canonical Graph Command or Operation invocation with executed results. Forward transport
  cancellation signals through Runtime Protocol dispatchers and render model requests, outcomes, and
  executed actions in Devtools Activity.
- 96d8092: Expose the bounded experimental Graph Read application contract, let both Semantic Console
  dialects author named predicate Holes, and project those Holes as schema-validated Devtools inputs
  before dispatching the unchanged canonical Graph Read request.
- e114d60: Reflect policy-authorized Entity mutation affordances once in Core and project them through Model
  Support and Runtime Protocol discovery. Devtools Console completion and diagnostics now use the
  published writable Fields, identity, conditions, Selection operators, and Field presence semantics
  without treating discovery as execution authorization.
- d1d3f36: Discover policy-registered direct, many-to-many, and ordered Relationship Commands through Runtime
  Protocol. The semantic Console now lowers explicit attach, detach, and move placements to canonical
  Graph Command bodies, and Devtools keeps those authoring affordances scoped to its live transport
  context.
- 82d155a: Transport policy-scoped Entity Selection updates and deletes through Graph Command protocol v3.
  Support the mutations in both Semantic Console dialects, advertise their permissions separately
  from exact Ref mutations, and reconcile every returned Entity mutation fact in Devtools.
- 6e9eb49: Extend the Semantic Console with safe TS-like and declarative syntax for exact Entity mutation
  Commands and reflected Operation invocations. Lower actions through the existing `graph.command`
  and `operation` Runtime Protocol families, and let generated client Entities provide the Console's
  schemas and Operation metadata.
- 848b50d: Add experimental typed choice interactions to durable Operation runs and carry inspection and
  responses through the existing Runtime Protocol.

### Patch Changes

- b807692: Render raw JSON payloads as accessible, collapsible trees while preserving whole-payload copying.
  Present HTTP operation exchanges as request and response columns, and align timeline metadata without
  duplicating terminal snapshots.
- 9a64911: Observe durable Operation runs from the Devtools Console and answer choice or approval Interactions through Runtime Protocol.
- b2cb4fe: Present pending durable Operation interactions in Activity, identify durable Console invocations as
  start-and-observe work, and restore their WebSocket observation after transient session loss with
  bounded exponential retries.
- Updated dependencies [7a9bb92]
- Updated dependencies [a35b2d0]
- Updated dependencies [8a7eaec]
- Updated dependencies [7eaddca]
- Updated dependencies [0802a01]
- Updated dependencies [03c1af6]
- Updated dependencies [c275332]
- Updated dependencies [399f7f5]
- Updated dependencies [f5e085f]
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
- Updated dependencies [8ff883f]
- Updated dependencies [e114d60]
- Updated dependencies [d1d3f36]
- Updated dependencies [82d155a]
- Updated dependencies [6e9eb49]
- Updated dependencies [072ad16]
- Updated dependencies [848b50d]
- Updated dependencies [9904cff]
  - @ontahi/core@1.0.0-alpha.13
  - @ontahi/language@1.0.0-alpha.13
  - @ontahi/language-codemirror@1.0.0-alpha.13

## 1.0.0-alpha.12

### Minor Changes

- 9c9b9b5: Add browser-safe runtime diagnostics, compositional transport instrumentation, and the opt-in React
  Devtools dock with application-intent summaries, progressive request/response inspection, and
  correlated operation-progress timelines in the unified Activity stream.
- e6584db: Group cached instances by entity type with collapsible groups and searchable names. Follow normalized field references to cached instances and return to the previous selection, search and detail section with Back.
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
- a8e1dbc: Add TS/Declarative switching to the Devtools Console with shared read semantics, completion,
  Boolean/enum controls, and receiver-backed table sort/limit edits. Switching never executes and
  undo/redo restores source and dialect together. Invalid drafts remain untouched. Hosts can choose
  an initial Console dialect; TS remains the default.
- cfca984: Support filtered and unfiltered exists() Console reads with completion and highlighting. Reuse
  bounded nullable Graph Read get requests and render successful results as booleans, preserving
  policy and transport errors. Reject limit and ordering modifiers for existence reads.
- 2e24549: Add Observe / Stop to the semantic Console for many queries over graph observation transports.
  Incoming snapshots update the result view and connected entity cache, remain visible in Activity,
  and can be recorded in Cache History. Cancel on Stop, drawer close, or client context replacement.

  Align Entity history settings with the other sections and theme the recording control and usage summary.

- cfca984: Add source-preserving Console limit edits and an editable limit control on Visual many-result
  tables. Applying a limit executes the current query and preserves filters, ordering, and Undo;
  the table retains its successful result and executed limit during pending or rejected reads.
- 40b6e3c: Author reflected contextual Selections in both Console dialects (`Book.parts.chapters.many()`
  and `Book through parts through chapters many`). Share semantic completion and destination Entity
  resolution across dialects, value widgets and permitted ordering suggestions. Preserve navigation
  through dialect switching and result-table edits, negotiate v2 before reading, and show canonical
  relation membership in Activity. Unsupported providers never fall back to a broader read.
- 5d9f605: Order Devtools views as Console, Activity, Cache, Settings and add a live, read-only inspector for normalized entities, aliases, cached outputs, and their explicit references. Connect the application cache through the optional clientCache prop.

  Organize selected cache entries into Data, References, and Aliases sections, with formatted, syntax-highlighted output keys and separate navigation actions.

- eea990c: Inspect graph query observation lifecycle and incoming snapshots in Activity. Add optional bounded,
  in-memory entity history with baseline capture, field differences, and retained invalidation/clear
  events, controlled from Settings and inspected in Cache History.
- 65e6d30: Add native ordered `hasMany` Relations with portable move commands, exact neighborhood conflict
  checks and deltas, natural ordered reads, in-memory and transactional PostgreSQL execution,
  Fetch/WebSocket transport support, React hooks, reflection, and semantic Devtools summaries.
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
- a8e1dbc: Share a browser-local authoring dialect preference through Devtools Settings and Explorer editors.
  Preserve Console drafts and undo history across tab navigation and convert valid drafts without
  executing when the preference changes. Add theme-aware, contrast-tested syntax highlighting for
  TS-like and Declarative Console queries and contextual Explorer predicates.
- cfca984: Add reflected Console orderBy syntax and source-preserving ordering edits. Visual result headers
  edit and execute the same Query through Runtime Transport with undo support, while retaining the
  last successful result and its ordering during draft changes, pending reads, and failures.

### Patch Changes

- a8e1dbc: Project captured Graph Read activity using the preferred authoring dialect in the activity list,
  selected detail, and visual request. Keep filtering aligned with the visible summary without
  rewriting diagnostic payloads or executing reads. Preserve nested declarative predicate grouping
  and display captured cardinality rather than inferring editor-only exists intent.
- cfca984: Compact Console results into a single toolbar with query duration, limit, and Visual/JSON controls.
  Remove repeated query and success summaries while preserving pending/stale notices and errors.
- a8e1dbc: Reopen Console completion after accepting ordering and predicate clauses so their Fields appear
  without another keystroke. Discover receiver-owned ordering permissions through a metadata-only
  graph.read request before executing data, with loading/error feedback and retry. Share that policy
  snapshot between completion, source-backed field/direction dropdowns in both dialects, and result
  headers. Preserve keyboard editing and undo, and invalidate stale metadata when Entity, transport,
  graph.read routing, or host-provided ExecutionIdentity changes. Identity changes clear prior Console
  results and cancel pending reads without discarding the draft or undo history. Support discovery through Runtime Protocol and standalone Express
  and Next.js Graph Read handlers; ordinary reads and observations retain their existing contracts.
- cfca984: Allow hosts to narrow Console ordering completions with an Entity-specific Field resolver. Devtools
  uses the same receiver capability snapshot as result headers, hiding unauthorized or unavailable
  ordering suggestions without restricting manual queries or other completion contexts.
- cfca984: Preserve Console member names as contextual identifiers in Selection fields and Entity names.
  Report structured cardinality mismatches for implicit get cardinality. Simplify Console analysis
  and result rendering while retaining source-backed controls and native accessible result status.
- cfca984: Expose opt-in, policy-derived ordering capabilities on successful Graph Reads and use them to
  enable Console result headers. Explain unavailable ordering without sending denied header actions,
  and refresh advisory permissions after transport replacement or policy rejection.
- 5397ff0: Keep diagnostic subscriber and payload-redaction failures isolated from instrumented runtime
  transports.
- Updated dependencies [d293ff1]
- Updated dependencies [14026dd]
- Updated dependencies [c16c898]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [d293ff1]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [6770db7]
- Updated dependencies [40b6e3c]
- Updated dependencies [5d510cc]
- Updated dependencies [40b6e3c]
- Updated dependencies [b81adfe]
- Updated dependencies [65e6d30]
- Updated dependencies [ced6a65]
- Updated dependencies [40b6e3c]
- Updated dependencies [cfca984]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [d293ff1]
- Updated dependencies [b709e59]
- Updated dependencies [1ece0ce]
- Updated dependencies [b709e59]
- Updated dependencies [6770db7]
- Updated dependencies [740cfd0]
- Updated dependencies [5d9f605]
- Updated dependencies [cfca984]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [5af84ba]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [96629f2]
- Updated dependencies [8e627d2]
  - @ontahi/core@1.0.0-alpha.12
  - @ontahi/language@1.0.0-alpha.12
  - @ontahi/language-codemirror@1.0.0-alpha.12
