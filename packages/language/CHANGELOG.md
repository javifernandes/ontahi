# @ontahi/language

## 1.0.0-alpha.12

### Minor Changes

- c16c898: Extend the contextual Selection language with Boolean composition, grouping, scalar operators,
  JSON-safe literals, reflection-aware diagnostics, and canonical Selection AST lowering.
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
- 740cfd0: Compose named Selection factories by intersection in Console reads: repeated `.by(...)` in the
  TS-like dialect and `by ... and by ...` in declarative. Preserve every invocation during dialect
  conversion and table modifier edits, complete subsequent factories and their inputs, and reject an
  invalid or incomplete invocation without executing a valid prefix. Execution remains an ordinary
  expanded Selection; the Core SDK continues to compose factory results with `.and(...)`.

  Include optional `by` and repeated `and by` clauses in declarative syntax-error guidance.

- cfca984: Allow hosts to narrow Console ordering completions with an Entity-specific Field resolver. Devtools
  uses the same receiver capability snapshot as result headers, hiding unauthorized or unavailable
  ordering suggestions without restricting manual queries or other completion contexts.
- a8e1dbc: Add opt-in headless declarative Console reads alongside the existing TS-like syntax, sharing
  Selection validation and Graph Read lowering. Convert valid drafts between dialects without
  execution while preserving terminal intent; invalid drafts are not converted. Editor and Console
  UI dialect switching remain a follow-up.
- cfca984: Add source-preserving Console limit edits and an editable limit control on Visual many-result
  tables. Applying a limit executes the current query and preserves filters, ordering, and Undo;
  the table retains its successful result and executed limit during pending or rejected reads.
- 40b6e3c: Author reflected contextual Selections in both Console dialects (`Book.parts.chapters.many()`
  and `Book through parts through chapters many`). Share semantic completion and destination Entity
  resolution across dialects, value widgets and permitted ordering suggestions. Preserve navigation
  through dialect switching and result-table edits, negotiate v2 before reading, and show canonical
  relation membership in Activity. Unsupported providers never fall back to a broader read.
- 5d510cc: Add the first recoverable Ontahí Selection text language, its CodeMirror adapter, and an opt-in
  Explorer proof that lowers a Boolean predicate to the canonical Selection AST and executes it
  through `graph.read`.
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
- cfca984: Add reflected Console orderBy syntax and source-preserving ordering edits. Visual result headers
  edit and execute the same Query through Runtime Transport with undo support, while retaining the
  last successful result and its ordering during draft changes, pending reads, and failures.

### Patch Changes

- cfca984: Preserve Console member names as contextual identifiers in Selection fields and Entity names.
  Report structured cardinality mismatches for implicit get cardinality. Simplify Console analysis
  and result rendering while retaining source-backed controls and native accessible result status.
- 740cfd0: Support reflected named Selection factories in TS-like and declarative Console reads. Share pure
  schema-validated expansion with Core, complete factory names and inputs, and preserve authored
  invocations during dialect conversion and result-table ordering/limit edits. One factory can be
  combined with a where predicate and the existing read terminals; receiver authorization is unchanged.
- 40b6e3c: Avoid quadratic regex backtracking when completing a conjoined factory keyword after a long
  invalid prefix. Scan backward from the cursor while preserving keyword replacement bounds.
- 40b6e3c: Compose filters before, between and after contextual Selection navigation in both Console dialects.
  Preserve stage-specific completion, rich values, source conversion and result ordering/limit edits.
- Updated dependencies [14026dd]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
- Updated dependencies [6770db7]
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
