# 120a. Pure Named Selection Factory Contract

Status: done

Canonical ID: `ontahi://plans/120a-pure-named-selection-factory-contract`

Parent: [120. Named And Saved Selections](../backlog/120-named-and-saved-selections.md)

Research: [150a. Selection Factories, Locators, And Refs](../done/150a-selection-factories-locators-and-refs.md)

## Proposal

Following the accepted direction in 150a, define the smallest code-owned Selection factory contract: an Entity-scoped
name, reflected input schema, and pure data-driven expansion to existing Selection meaning.
`Customer.by({ loginEmail: { email: "a@example.com" } })` is representative authoring, not a frozen
API. Factories may share input shapes; names select the meaning. A canonical identity remains one
independent Entity contract, not one identity per factory.

## Bounded Slice

### Execution decision — 2026-09-10

Implement `by` alongside existing locators, validate representative uses, and only then decide
whether deprecation/migration is justified. No locator is deprecated or removed in this slice.
Selection remains deferred membership data, not a fetch, Promise, or cached entity. Consumers own
one/many requirements; composing constraints must not materialize members or mutate the caller's
Selection. Identity, existence, and authorized cardinality remain distinct.

Delivery order: Core factory declaration/reflection and typed `by` proof; Read authoring in both
dialects; 116a cardinality hardening; then explicit Command consumer contracts and Operations.
Do not silently extend exact remote Commands to arbitrary predicates or implement read-then-write.

The first Core slice uses a data-first scalar-predicate/identity template, not an opaque callback.
Existing ModelExpression programs model evaluated field/ref/aggregate expressions (including only
`lte` comparison), not scalar substitution into Selection predicates. A small template binding
boundary reuses Graph schemas and existing Selection validation, without extending that evaluator.
Callback sugar and composed templates remain deferred. Subsequent checkpoints below cover portable
codegen and the bounded Console grammar proof.

1. Compare existing Model Expression facilities with the parameter substitution needed for one
   scalar predicate; do not publish the 150a test fixture as a general registry.
2. Reflect input types and validation, with explicit optional single-input shorthand. Validate
   output membership against the target Entity; do not trust an arbitrary client template.
3. Lower to existing Selection ASTs and retain ordinary receiver field/scope enforcement. Do not
   invent a named authorization grant through client-side expansion.
4. Specify declaration identity/version, built-in identity factory name collisions, and how the
   original invocation survives authoring without claiming reverse inference from arbitrary ASTs.
5. Prove a conventional identity case and a domain criterion whose input is not an Entity Field.
6. Include both declaration and invocation in the proof. If a TypeScript callback builder is offered,
   compile symbolic inputs to reflected template data; do not serialize opaque JavaScript. Prove
   explicit input binding and distinguish deterministic expansion from changing membership. Hidden
   time/state and external I/O remain outside pure factories. See the declaration sketch in 150a;
   `by` is working authoring vocabulary, not a frozen domain keyword.

## Non-Goals

No Ref wire-format removal, immediate `refByX` deprecation, external resolver, saved-selection
persistence, bulk remote mutation, or new Runtime Protocol family. The two-dialect Read proof in
Plan 150 does not depend on implementing this proposal.

## Core implementation checkpoint — 2026-09-10

- Added experimental `withSelectionFactories(Entity, declarations)` and typed `by` on the
  definition/client facade. Required scalar input schemas, explicit single-input shorthand,
  predicate templates, and canonical identity bindings are supported. Composite identity does
  not call a legacy resolver; existing `refById` and declared locators remain available.
- Names are explicit, including identity factory names. A legacy `by` method collision is rejected.
  Positive declaration versions belong to the application; this is not a server-side registry.
- `selectionFactories` exposes copied JSON descriptors on the augmented definition, not yet
  application discovery/codegen. `factoryInvocation` records normalized source inputs separately
  from `toAst`/`toJSON`; composition and bridge hydration retain ordinary Selection meaning.
- Proved scalar inputs that are not Entity Fields, duplicate input shapes with different named
  meanings, JSON bridging, immutable constraint composition, no-read mutation assembly, receiver
  policy enforcement, and exact-one mutation failure without changing the dataset.
- The real Operation proof exposed an existing local-input normalization gap: an already built
  Selection bypassed the consumer's cardinality. Normalization now applies that contract without
  mutating the original. Zero/one/two-member Operation cases cover the integration. This does not
  resolve 116a's separate read-shaping/provider question.
- The package-consumer fixture uses `by` as a real Operation input and checks the public typed facade
  from installed artifacts, while Core tests preserve legacy locator compatibility.

Remaining: review declaration ergonomics with the user; application descriptor/codegen propagation;
Read authoring in both dialects; and migration of representative callers before considering any
deprecation. Composed templates and callback sugar remain deferred. No Console UI changed here.

Validation: 953 Core tests passed (37 added), Core coverage/typecheck/build/lint, root script lint,
repository format check, and clean-room package install/type/runtime checks on Node 24. The latter
executes an exact-one Operation using a factory Selection and mounts the Express adapter. No live
PostgreSQL/Supabase or UI verification is claimed for this Core-only slice.

## Discovery/codegen/inspection checkpoint — 2026-09-10

- Graph discovery now exposes strict input and Selection output contracts, template, version and
  shorthand. Output deliberately omits consumer cardinality; discovery does not grant read access.
- Codegen recognizes exported `withSelectionFactories` wrappers over unified Entity declarations,
  including a local Entity variable and named object-literal maps. Only portable literal data and
  Core schema constructors cross the browser boundary; opaque expressions produce diagnostics.
- Generated modules are typechecked and executed against Core, proving typed inputs, metadata,
  predicate expansion and preserved legacy locators. Numeric literals are synthesized when printing
  projected ASTs, fixing the missing-version literal exposed by this proof.
- Explorer's Entity Structure panel displays contracts through the existing input schema viewer.
  Todo's Tag exposes `identity` and `named`, with regenerated browser code as a concrete example.
- Remaining: schema-driven invocation forms and `by` in both Console dialects, broader declaration
  composition, then representative migrations before any locator deprecation. The UI delivered here
  inspects contracts; it does not invoke factories. No read-shaping/provider cardinality work is
  folded into this slice.

Validation: Core 953, codegen 96, Explorer 197 and Todo 68 tests passed; coverage for the three
packages, affected package lint/typechecks/builds, Todo codegen drift check and production build,
repository formatting/root lint, and clean-room package install/type/runtime verification passed.
The installed consumer checks factory discovery over HTTP. The Todo tests require local socket
access and passed outside the sandbox; generated-module tests use the existing 30-second
compilation timeout. Browser inspection and screenshot review confirmed the Tag Structure panel in
Todo's forced-light theme; no dark-theme or live database-provider verification is claimed.

## Console authoring checkpoint — 2026-09-10

- Both dialects now accept one reflected factory plus optional `where`, existing ordering/limit
  modifiers, and all five read terminals. TS uses `Tag.by({ named: "Work" }).many()`;
  declarative uses `Tag by named "Work" many`. Structured inputs are also supported, and scalar
  shorthand is accepted only when declared. Factory names are not inferred from Entity Fields.
- Schema-driven completion covers factory names, input names, and scalar values (including
  Boolean/enum alternatives). Unknown factories, invalid/duplicate/extra inputs, and incomplete
  drafts cannot execute. Quoted names and punctuation inside string inputs remain unambiguous.
- Language lowering and Core `by` share pure schema-validated expansion. `where` intersects
  membership without fetching records; no wire node or receiver authorization bypass is added.
- The authored invocation remains in the syntax model during dialect conversion and table-driven
  order/limit edits. Mounted Devtools tests execute this composition and preserve it while switching
  dialect and sorting. Deletion-prefix tests exercise incomplete syntax without editor hangs.
- Deferred: multiple `by` clauses, `and by`/`or by`, composed templates, nested/optional inputs,
  external resolvers, Explorer invocation forms, and locator migration. Consumer read shaping
  (116a), Commands, and Operations remain their own next slices.

Validation: Core 953, Language 230, CodeMirror 64 and Devtools 98 tests passed, with coverage;
affected typechecks/builds/lint, Todo codegen drift check and production build, repository formatting
and root lint, and clean-room installed-package checks passed. A browser smoke test executed
`Tag.by({ named: "Work" }).where(name = "Work").many()`, converted it to declarative, and sorted
from the result table while preserving the invocation. Screenshot review confirmed highlighting and
rich ordering controls in the dark Console. No live database-provider verification is claimed.

## Intersection and closure checkpoint — 2026-09-10

The user exercised the Console proof and accepted the pure, portable expansion model as reusable
Selection authoring rather than remote Operation execution. The final bounded language slice adds
repeated TS-like `.by(...)` and declarative `and by`, always interpreted as intersection. Repeated
factory names retain independent inputs; an invalid later invocation blocks the entire read.

The source model retains every invocation in order, including through dialect conversion,
ordering/limit edits, incomplete drafts, and completion in earlier or later arguments. The Core SDK
still composes factory-produced Selections with `.and(...)`; no new Selection method or wire node
is needed. Activity continues to show the expanded request that actually crossed the transport.

This closes the bounded contract and Console proof, not the larger named/saved-selection project.
Deferred factory union/grouping, composed templates, richer inputs, Explorer invocation forms, and
representative locator migrations are tracked in [120](../backlog/120-named-and-saved-selections.md).
No locator is deprecated. Consumer cardinality before read shaping remains
[116a](../next/116a-selection-cardinality-before-read-shaping.md), ahead of Console Commands.

Closure validation: Language 262, CodeMirror 66 and Devtools 99 tests passed with coverage;
affected typechecks/builds/lint, repository formatting/root lint, and clean-room installed-package
verification passed on Node 24. Todo codegen/typechecks and production build passed. Browser smoke
executed two factories plus `where`, converted dialect, sorted from the table, and confirmed that
disjoint factories return count zero. Screenshot review confirmed the composed source and rich
ordering controls. No live database-provider verification is claimed.

## Acceptance

- [x] Public API and reflection are accepted after a small executable proof, with the bounded
      pure-template contract retained as experimental and broader extensions explicitly deferred.
- [x] Equivalent inputs and explicit shorthand lower identically; same-shaped named alternatives
      remain distinguishable and invalid inputs fail before execution.
- [x] Canonical identity, explicit-member intent, consumer cardinality, and receiver policies remain
      intact; legacy facade and Ref contracts are not silently changed.
- [x] Scope is split again if server-side resolution or a protocol extension becomes necessary
      (neither is introduced; those extensions remain outside this slice).
