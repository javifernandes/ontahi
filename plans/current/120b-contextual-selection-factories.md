# 120b. Contextual Selection Factories

Status: current

Canonical ID: `ontahi://plans/120b-contextual-selection-factories`

## Intent and motivating case

Give reusable names to relation-derived membership: `Book.parts` is a factory that takes a Book
Selection as context and produces a ContentNode Selection, without reading either population.
This extends the pure-factory direction of [120a](../done/120a-pure-named-selection-factory-contract.md),
not the scalar derived-Field mechanism and not a new identity/locator mechanism.

BookOps' `listThreadsForChapter` exposed three separate concerns: the Operation's semantic input,
reusable domain navigation, and the UI path that helps a person choose an input. Its handwritten
`graphOps` path repeats relation information and includes `contents`/`children` names that are not
both actual model relations. Do not turn those hints into executable relations by renaming them.

Implement this plan before [152](../next/152-discriminated-entity-variants.md). In this plan `parts`
and `chapters` still return ContentNode membership; they do not introduce Part/Chapter Entities.

## Entity authoring (local experimental API)

Declaration and use must both remain model-shaped. Desired declaration sugar:

```ts
// Entity declaration option; relation targets must be available before use/reflection.
selections: ({ self }) => ({
  parts: self.contentNodes.where(node => node.type.eq('part')),
});

// ContentNode must first declare its real parent/children relation.
selections: ({ self }) => ({
  chapters: self.children.where(node => node.type.eq('chapter')),
});

const chapters = Book.by({ slug: 'my-book' }).parts.chapters;
```

Here `self` is a symbolic source Selection, not a loaded row. The declaration compiler captures
membership data once; it must not retain an arbitrary callback for invocation. The minimal proof
may use an explicit Entity and relation key before introducing this contextual declaration surface.
Relation target, join evidence and per-source multiplicity come from the existing relation; callers
must not repeat `entityName`, `sourceField`, `locator` and `cardinality` in each factory.

Factories have a reflected source Selection contract, optional explicit parameter schema, and a
target Selection contract. This is the contextual case of the same pure factory idea as `by`.
Start with parameterless contextual factories; share scalar parameter binding with 120a only when
that extension is implemented. Do not create competing registries with inconsistent validation.

## Semantic decisions

- Distinguish same-Entity restriction (`archived`: Selection<TodoList> → Selection<TodoList>) from
  relation-derived navigation (`openItems`: Selection<TodoList> → Selection<TodoItem>). Both build
  deferred membership, but the latter changes the population via relation image and target filtering.
  It resembles a derived relation, not a scalar computed Field or a row-shaped projection retaining
  one source row. Keep this distinction in the model without renaming the current API or introducing
  materialization/invalidation semantics during the language refactor. `TodoList.archived().openItems`
  is a design illustration, not a newly supported declaration or call syntax.

- Construction, composition and serialization perform no reads. Membership is evaluated by the
  consumer; a factory is neither a cached population nor an existence/uniqueness assertion.
- Navigation from multiple source members produces the union of related target members, deduplicated
  by canonical target identity. It does not preserve source grouping or imply an order. Grouped
  navigation and per-parent limits are separate query-shaping features.
- Each hop preserves its source and target predicates. Consumer ordering/limit apply to the final
  read; neither belongs in the factory's membership template. Source read shaping is not accepted
  as an implicit membership boundary.
- One/many requirements belong to consumers. A belongs-to relation from many sources does not
  establish a singleton result. [116a](../next/116a-selection-cardinality-before-read-shaping.md)
  remains the cardinality hardening gate before using these as exact-one inputs.
- Expanded graph membership must authorize every source, relation and target at the receiver.
  Neither a public factory name nor client-side expansion grants authority. Unsupported adapters
  or protocol paths must fail explicitly; never drop traversal and read the entire target Entity.
- Read-only delivery first. Mutating `parts` as if it were a stored relation has no defined meaning;
  a future Command over the selected targets must not become a read-then-write implementation.
- Book root chapters and Book → Part → Chapter are separate branches. An optional UI step does
  not silently skip a graph hop. Picker affordances are not Operation preconditions.

## Execution slices

1. **Core executable experiment (completed).** Declare a reusable source-relative relation/filter
   once, compile without runtime access, and exercise Book → parts → chapters plus a plain
   TodoList → items control. Inspect portable data, source/target typing, multiple/empty roots,
   and changing membership using the existing in-memory relation-root executor. Keep experimental
   helpers test-local until the portable membership design is proven.
2. **Canonical membership and declaration contract.** Close the gap between Selection AST and
   `RelatedRootReadSpec`: the latter is a read execution plan, not a portable Selection. Coordinate
   the minimal relation-membership node with [119](../backlog/119-selection-relation-predicates.md);
   do not implement all `some`/`every`/`none` quantifiers as incidental scope. Define validation,
   recursive copying, serialization, parameter binding and recursive/cyclic declaration diagnostics.
   Then add the real typed declaration/facade surface, preserving `by` and ordinary composition.
3. **Reflection and codegen (before SQL).** Complete entity declaration/property integration and
   preserve source/input/output contracts in discovery and generated clients. Emit portable data,
   not server closures; test generated execution/types and installed artifacts. Reject name collisions.
4. **Runtime and receiver vertical slice.** In-memory plus SQL lowering (PostgreSQL first), policy
   scopes at every hop, wire version/capability handling, bounded complexity, explicit unsupported
   behavior for other providers. Verify remote/local parity. Reuse relation resolution, never store
   physical join JSON in domain declarations. Audit many-to-many and composite identity support.
5. **Language and product proof.** Both TS-like and declarative dialects can author navigations,
   including completion and recoverable incomplete drafts. Choose declarative spelling with a
   small grammar proof. Preserve factories/navigation during dialect switching and table-driven
   sort/limit changes. Activity renders the canonical executed meaning in the chosen dialect.
   Prove it in Todo and a simplified BookOps fixture before adapting BookOps after a release.

Each slice must leave its unsupported boundaries visible. The experiment is not public support for
`.parts`, schema-native contextual Operation inputs, or the REPL. Split implementation PRs by a
coherent supported boundary rather than expanding all layers in the first change.

## Acceptance

- [x] Executable Core experiment records supported reuse and the remaining AST/protocol gap.
- [x] A declaration derives relation metadata and produces typed, immutable deferred membership.
- [x] `by` → contextual factory → contextual factory composes without fetching source members.
- [x] Canonical round-trip and validation preserve every hop and reject malformed/unknown paths.
- [x] Empty/multiple roots and shared targets have explicit set semantics; no accidental grouping.
- [x] Receiver scopes, invalid paths and unsupported providers cannot broaden the target set.
- [x] In-memory and PostgreSQL behavior agree, with other provider support explicitly tracked.
- [x] Discovery/codegen and installed package tests preserve source/input/output contracts.
- [x] Both language dialects, completion, Activity and result controls preserve the same meaning.
- [x] Todo and simplified BookOps cases pass; remaining work is linked before closing this plan.

## Non-goals and follow-ups

No variant Entity implementation, locator removal, external resolver, saved-selection persistence,
new picker DSL, derived-relation writes, BookOps dependency upgrade, or automatic release here.
Existing `graphSchema.existingRef` remains materializing; do not silently replace a deferred
Selection with it. BookOps' current resolver can return chapter-location data without verifying a
Chapter row exists, so later migration requires an explicit domain decision.

## Verification

Run focused executable tests, Core suite, typecheck, build, lint and formatting for the first slice.
Later slices add installed-artifact/codegen tests, wire/policy negative cases, SQL integration and
browser checks. Record actual evidence at each checkpoint; do not claim unavailable providers or UI.

## Open design gates

Canonical traversal representation and compatibility/versioning; definition syntax and collisions;
self-referential Entity typing; parameterized contextual templates; read-only facade binding; and
relation policy semantics. Resolve them with small executable proofs before making public promises.

## Core experiment checkpoint — 2026-09-12

Added eight executable tests in
`packages/core/src/data-graph/contextual-selection-factory-research.test.ts`. The test-local factory
accepts an Entity, one of its actual relation keys, and an optional typed target predicate. It
compiles the predicate once, validates it with the existing Selection schema, derives the target
from the relation, and exposes copied JSON declaration data with source/output contracts.

The existing in-memory executor successfully runs `by → parts → chapters` with every hop's filter,
multiple/empty roots, and membership created after plan assembly. A plain TodoList → items control
works without classifiers, and a many-to-many case returns a shared target once. Wrong context,
unknown relation names and invalid target fields are rejected; compile-time assertions check the
inferred target and the source/field boundaries. No runtime exists when the composed read is built.

The experiment deliberately remains test-local: applying it returns `RelatedRootReadSpec`, which
the current Selection input schema rejects. Only its declaration descriptor round-trips as JSON;
this does **not** prove portable composed membership, transport, authorization or codegen. The
helper is not a new supported factory API, and no public `.parts` property or REPL support ships.

**Next slice identified by the experiment (implemented below):** introduce the minimal canonical relation-image expression: target
membership reached through a declared relation from a source Selection. Retain source predicates
and the relation key in data, intersect the result with target predicates, and lower it to existing
relation execution where supported. First prove recursive schema validation/copying and explicit
rejection at unsupported wire/provider/Command boundaries; never flatten it to the target filter
alone. Do not promote the experimental read-plan helper as the final Selection abstraction.

Validation on Node 24: all 961 Core tests passed (eight added), Core typecheck/build/lint and
repository formatting passed. Empty Changeset records the test-only package change. No SQL, remote
dispatch, installed-artifact or browser verification was needed or claimed for this experiment.

## Canonical membership checkpoint — 2026-09-12

Implemented the bounded Core membership slice, not the complete plan:

```ts
const parts = contextualSelectionFactory(Book, 'contentNodes', node => node.type.eq('part'));
const chapters = contextualSelectionFactory(ContentNode, 'children', node =>
  node.type.eq('chapter'),
);
const selected = chapters.from(parts.from(Book.by({ slug: 'my-book' })));
const portable = selected.toAst();
```

- Added `relation-image` to the Selection algebra, retaining a source Selection AST and relation
  name. `Selection.through` and the experimental parameterless contextual factory produce real
  Selections, composed with existing intersection/union/complement. The declaration compiles once
  to copied data; source contexts and serialized copies also own their nested reference values.
- Source and target contracts are available on the factory's copied `descriptor`. This is local
  reflection only, not application discovery, generated client registration or a named property
  facade. The explicit `.from` API keeps that boundary visible.
- Selection schemas accept receiver-owned `entities` for graph name resolution. Recursive validation
  checks source fields/Refs, relation targets and nested membership, rejects read shaping in source
  ASTs, and bounds expression depth/nodes to 32/1000. Unknown or ambiguous model definitions fail.
- In-memory reads resolve relational membership at execution, using existing relation-root reads
  internally and applying final query shaping afterward. This is local read evaluation, not
  client-side prefetch or a snapshot in the authored AST. Every execution re-evaluates membership.
  Tests cover empty/multiple sources, self-relations, shared many-to-many targets, composite target
  identity, nullable belongs-to, and one/many separation. Existing 116a limit/cardinality work remains
  separate; this checkpoint does not claim to fix it.
- Graph read protocol v1 rejects these expressions at both authoring and receiving boundaries.
  SQL/shared storage compilation and mutation assembly/execution reject them explicitly, including
  nested expressions. No graph policy grant, remote traversal or read-then-write behavior is implied.
- Package documentation and the clean-room consumer cover public declaration, JSON rehydration,
  type inference and real in-memory execution. The minimal Express consumer remains dependency-minimal;
  the new Effect-based smoke runs in the complete package consumer.

Validation: 977 Core tests (16 new in this checkpoint), 19 SQL tests, both coverage runs,
Core/SQL lint, root script lint, repository formatting, all 15 package builds/typechecks, and
installed-artifact type/runtime checks passed. Local dependency links were refreshed from the
unchanged lockfile after moving to main's SQL package layout; a clean rebuild removed stale emitted
declarations. No live PostgreSQL/MySQL/Supabase service or UI verification is claimed.

**Sequencing correction:** complete entity-attached declarations, named properties and discovery/codegen
before PostgreSQL. The explicit low-level factory alone does not finish domain authoring.

## Entity declaration/facade checkpoint — 2026-09-12

- Added `entity({ selections: ({ self }) => ({ parts: self.contentNodes.where(...) }) })` and
  `withContextualSelections` for low-level/generated definitions. Compilation is lazy until relations
  are ready and cached after success; property collisions and arbitrary resolver objects fail.
- `.by(...).parts`, `.and(...).parts`, `.where(...).parts` and target chaining preserve membership
  and types. Runtime-bound Selections preserve execution binding. Loaded rows gain no properties.
- Source read shaping is explicitly rejected during navigation; apply modifiers to the target read.
- Discovery exposes copied source/target contracts and templates. Codegen compiles a deliberately
  bounded literal-predicate grammar to data, including deferred relations and the simplified
  `Book → ContentNode.parts → ContentNode.chapters` case. Opaque callbacks get diagnostics.
- Self-relation targets retain their declared contract; unrestricted recursively inferred facade
  types, arbitrary callback grammar, factory parameters and composing declarations via other named
  factories remain separate work. No new Entity variants were introduced.

Validation: 982 Core tests and 126 codegen tests passed, including coverage runs, semantic
typechecking/execution of generated modules, and clean-room installed-package type/runtime checks.
Workspace builds/typechecks (including Todo/Classroom examples), Core/codegen/root lint and repository
formatting passed. No remote provider, Console UI or SQL execution support is claimed by this slice.

**Next actionable slice:** PostgreSQL relation-image reads plus source/relation/target policy and
wire capability/version handling. Keep unsupported providers explicit. Console navigation, both
dialects and Todo UI proof follow those execution/authority guarantees. Do not begin variants (152) yet.

## PostgreSQL local-read checkpoint — 2026-09-12

The declaration/Core work was committed as `3c38cb4`. This next bounded slice implements trusted
local PostgreSQL reads; it deliberately does not open protocol v1 or reuse an include permission as
permission to observe source membership.

- Relational images lower to correlated `EXISTS`, including nested/self navigation and set union/
  complement. Every source uses a distinct quoted alias and the query shares one parameter list.
  Receiver-owned mappings and canonical schema validation resolve names; no caller supplies joins.
- PostgreSQL opts into the shared SQL compiler's explicit Selection mapping context. Plain reads,
  projected reads, count/get/stream use it; ordinary Selection/Command compilation remains closed.
  Membership is evaluated by the database on each execution, before final result modifiers.
- Direct joins reuse declared relation fields and retain composite target identities. Many-to-many
  joins use declared edge mapping and require single-field source/target identities. Composite edge
  joins and virtual filter fields fail explicitly; their implementation remains provider work.
- MySQL runtime and Supabase remain unsupported for this AST. No new Console syntax or new wire
  capability was introduced. SQL support is not permission to traverse the graph remotely.

Receiver follow-up: authorize every source Entity and relation hop explicitly, and apply each
Entity's scope at its own membership boundary, including under `not`/`or`. Target-only policy and
include grants do not establish this contract. Define/version and advertise this capability before
accepting relation-image JSON; keep legacy v1 fail-closed.

Validation: 23 SQL tests and 107 PostgreSQL tests passed, with coverage. The PostgreSQL suite used
disposable containers (the external database override was checked absent); six new live cases cover
nested/self navigation, one-statement execution, final shaping/count, empty/complement/union sets,
shared many-to-many targets, nullable belongs-to, fresh evaluation and composite direct targets.
SQL/PostgreSQL typechecks and lint, all 15 package builds, formatting, and clean-room installed
package type/runtime checks passed. The focused PostgreSQL suite was rerun after rebuilding packages.
No live MySQL/Supabase contextual support or remote authority contract is claimed.

Next: receiver policy/protocol vertical slice, then UI.

## Receiver authority checkpoint — 2026-09-12

PostgreSQL local reads were committed as `270d3b3`. The next bounded slice adds low-level v2
request/response authorization; it does not automatically enable application adapters or clients.

- `toGraphReadRequestV2` transports the canonical Selection; v2 resolution uses the receiver's
  schema registry, strict expression validation and bounded AST depth/node count. v1 stays closed.
- A dispatcher must explicitly enable `relationSelections` for a compatible executor. Every hop
  requires source/target policies, a source `selectionRelations` grant, the requested mode and
  permitted source filters. View/include grants do not imply membership authority.
- Each source and final target gets its own scope outside caller `not`/`or`. A policy scope resolves
  once per Entity per request, is not cached across requests, and remains scalar membership to
  avoid recursive authority expansion. Only the final result has projection/cardinality/limits.
- Capability discovery reports advisory v2 support and outgoing membership grants without reading
  data. Default dispatchers, existing remote clients and graph observation remain closed to v2.

Validation: Core coverage suite, real disposable-PostgreSQL contextual tests (including v2 scopes
and one-statement execution), clean-room installed-package type/runtime proof, all package builds,
workspace typechecks including examples, and Core/PostgreSQL lint passed. New regressions cover
missing grants/policies/modes/filters, independent source/intermediate/target scopes, `not`/`or`,
per-request reevaluation, private scope failures, malformed/bounded ASTs and legacy rejection.

Next: application/provider opt-in wiring and client capability negotiation, then Console navigation
in both dialects and Todo UI proof. Observation needs source-change invalidation evidence before
enabling v2. Commands and discriminated Entity variants (152) remain later work.

## Application/client checkpoint — 2026-09-12

- In-memory and PostgreSQL storage declare `graphReadCapabilities.relationSelections`; application
  dispatchers use that provider-owned support flag. Unsupported/custom storage stays closed by
  default; declaring support never replaces source/target policies or outgoing grants.
- Remote and React clients detect contextual ASTs and encode a copied v2 request before I/O.
  They discover the target's v2 capability with the same transport/options before sending the read.
  Capability results are validated, advisory and not cached across requests or authorities.
- Plain reads stay on v1 without extra requests. Missing capability, metadata errors and denied
  reads fail without downgrade, retry or source-ID prefetch. Custom read transports accept the
  Graph Read family union (including metadata). Both common and legacy HTTP paths carry it.
- Contextual observation remains explicitly unsupported. No new Console syntax was added here.

Validation: 1008 Core, 108 PostgreSQL, 117 React and 45 Express tests passed with coverage. The
Express proof used real loopback HTTP and server-owned request authority; PostgreSQL ran in
disposable containers and proved metadata-only negotiation followed by one SQL statement. All
15 package builds, workspace/example typechecks, affected-package lint, repository formatting
and clean-room installed-package negotiation/runtime verification passed. The initial HTTP run
was blocked by sandbox `listen` permissions; the host-permitted run passed after explicitly
mounting the test's `/runtime` route.

Next: contextual navigation authoring and completion in both Console dialects, with Todo UI proof.
Keep observation/source invalidation, Commands and Entity variants separate.

## Language/product checkpoint — 2026-09-12

- Both dialects share navigation syntax nodes and destination resolution. TS uses
  `Book.by({ slug: "my-book" }).parts.chapters.many()`; declarative uses
  `Book by slug "my-book" through parts through chapters many`. The same portable descriptors
  expand to the same v2 Selection AST; no invocation callback or source population is read.
- Completion now shares one semantic continuation catalog, contextual candidates, target Field/value
  resolution and ordering permission hints. Dialect adapters retain cursor recovery and spelling.
  A complete executable AST is not required for cursor assistance: incomplete drafts resolve only
  their completed hops. Unknown/unavailable prefixes never fall back to the root Entity.
- Boolean/enum widgets, order dropdowns and Console capability discovery use the destination Entity.
  Dialect conversion and table sort/limit edits retain all authored factories and hops. Mounted
  CodeMirror tests delete every suffix without hanging; mounted Console tests cover execution,
  conversion, target widgets, sorting, limit changes and explicit unsupported-provider failure.
- Console discovers v2 capability before every contextual execution, on the active transport, with
  cancellation retained. Activity renders expanded canonical source/relation/target meaning rather
  than inferring a factory name. Plain reads remain v1.
- Todo declares `openItems` from `self.items.where(item => item.completed.eq(false))` and `labels`
  from `self.tags`, grants outgoing `items`/`tags` membership explicitly, and regenerates its client.
  HTTP tests execute generated `.openItems.labels` through the normal runtime endpoint. The
  simplified BookOps grammar proof retains `type = part/chapter` over ContentNode's self-relation;
  it does not introduce variant Entities or change the BookOps application.

Scope retained: root scalar `by` clauses precede contextual hops, then target `where` and read
shaping. Interleaved source filters and `by` after navigation, parameterized contextual factories,
raw relation authoring, observation/source invalidation, and mutation support remain separate work.
Keep richer Console composition with [150](150-ontahi-devtools-semantic-console.md), relation membership
extensions with [119](../backlog/119-selection-relation-predicates.md), cardinality hardening with
[116a](../next/116a-selection-cardinality-before-read-shaping.md), and variants with
[152](../next/152-discriminated-entity-variants.md). Review this read-only boundary before commands
or adapting BookOps after a release.

Validation: 289 language, 68 CodeMirror and 102 Devtools tests passed with coverage; all 70 Todo
tests passed, including real HTTP/WebSocket and its disposable MySQL baseline. Initial Todo test
invocation omitted the official authentication-mode setup; the official test script passed.
All 15 package builds, package/example typechecks, affected-package lint and repository formatting
passed. Clean-room tarball installation/type/runtime checks include Console compilation, dialect
conversion, contextual completion and execution through the real v2 dispatcher. Active Todo
watchers briefly overwrote declaration outputs during parser regeneration; final type/artifact
verification used the generated parser and freshly rebuilt outputs without stopping the dev session.
