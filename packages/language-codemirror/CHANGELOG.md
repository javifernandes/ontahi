# @ontahi/language-codemirror

## 1.0.0-alpha.12

### Minor Changes

- c16c898: Extend the contextual Selection language with Boolean composition, grouping, scalar operators,
  JSON-safe literals, reflection-aware diagnostics, and canonical Selection AST lowering.
- a8e1dbc: Add TS/Declarative switching to the Devtools Console with shared read semantics, completion,
  Boolean/enum controls, and receiver-backed table sort/limit edits. Switching never executes and
  undo/redo restores source and dialect together. Invalid drafts remain untouched. Hosts can choose
  an initial Console dialect; TS remains the default.
- cfca984: Allow hosts to narrow Console ordering completions with an Entity-specific Field resolver. Devtools
  uses the same receiver capability snapshot as result headers, hiding unauthorized or unavailable
  ordering suggestions without restricting manual queries or other completion contexts.
- 40b6e3c: Author reflected contextual Selections in both Console dialects (`Book.parts.chapters.many()`
  and `Book through parts through chapters many`). Share semantic completion and destination Entity
  resolution across dialects, value widgets and permitted ordering suggestions. Preserve navigation
  through dialect switching and result-table edits, negotiate v2 before reading, and show canonical
  relation membership in Activity. Unsupported providers never fall back to a broader read.
- 5d510cc: Add the first recoverable Ontahí Selection text language, its CodeMirror adapter, and an opt-in
  Explorer proof that lowers a Boolean predicate to the canonical Selection AST and executes it
  through `graph.read`.
- b709e59: Add opt-in, reversible finite-value projections for resolved Boolean and enum Selection literals,
  and enable them in Explorer with a compact filter surface, contextual help, keyboard editing, and
  ordinary document history.
- 1ece0ce: Add Selection completion, semantic highlighting, and hover help powered only by static reflection,
  plus a host-themed completion UI, reliable Backspace editing, recoverable execution failures, and
  typed Color result cells. Valid Selections continue to execute through the existing Graph Read
  path.
- b709e59: Support portable Reference identity literals in Selection documents, optional runtime-backed search
  and rich Reference projections in CodeMirror, and authorized Reference lookup in Explorer filters.
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

### Patch Changes

- cfca984: Support filtered and unfiltered exists() Console reads with completion and highlighting. Reuse
  bounded nullable Graph Read get requests and render successful results as booleans, preserving
  policy and transport errors. Reject limit and ordering modifiers for existence reads.
- 740cfd0: Compose named Selection factories by intersection in Console reads: repeated `.by(...)` in the
  TS-like dialect and `by ... and by ...` in declarative. Preserve every invocation during dialect
  conversion and table modifier edits, complete subsequent factories and their inputs, and reject an
  invalid or incomplete invocation without executing a valid prefix. Execution remains an ordinary
  expanded Selection; the Core SDK continues to compose factory results with `.and(...)`.

  Include optional `by` and repeated `and by` clauses in declarative syntax-error guidance.

- a8e1dbc: Reopen Console completion after accepting ordering and predicate clauses so their Fields appear
  without another keystroke. Discover receiver-owned ordering permissions through a metadata-only
  graph.read request before executing data, with loading/error feedback and retry. Share that policy
  snapshot between completion, source-backed field/direction dropdowns in both dialects, and result
  headers. Preserve keyboard editing and undo, and invalidate stale metadata when Entity, transport,
  graph.read routing, or host-provided ExecutionIdentity changes. Identity changes clear prior Console
  results and cancel pending reads without discarding the draft or undo history. Support discovery through Runtime Protocol and standalone Express
  and Next.js Graph Read handlers; ordinary reads and observations retain their existing contracts.
- 740cfd0: Support reflected named Selection factories in TS-like and declarative Console reads. Share pure
  schema-validated expansion with Core, complete factory names and inputs, and preserve authored
  invocations during dialect conversion and result-table ordering/limit edits. One factory can be
  combined with a where predicate and the existing read terminals; receiver authorization is unchanged.
- 40b6e3c: Compose filters before, between and after contextual Selection navigation in both Console dialects.
  Preserve stage-specific completion, rich values, source conversion and result ordering/limit edits.
- cfca984: Add reflected Console orderBy syntax and source-preserving ordering edits. Visual result headers
  edit and execute the same Query through Runtime Transport with undo support, while retaining the
  last successful result and its ordering during draft changes, pending reads, and failures.
- Updated dependencies [c16c898]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [cfca984]
- Updated dependencies [a8e1dbc]
- Updated dependencies [cfca984]
- Updated dependencies [cfca984]
- Updated dependencies [740cfd0]
- Updated dependencies [40b6e3c]
- Updated dependencies [5d510cc]
- Updated dependencies [40b6e3c]
- Updated dependencies [40b6e3c]
- Updated dependencies [1ece0ce]
- Updated dependencies [b709e59]
- Updated dependencies [cfca984]
- Updated dependencies [cfca984]
  - @ontahi/language@1.0.0-alpha.12
