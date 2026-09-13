# 152. Discriminated Entity Variants

Status: current

Canonical ID: `ontahi://plans/152-discriminated-entity-variants`

Prerequisite: [120b. Contextual Selection Factories](../done/120b-contextual-selection-factories.md)

## Intent

Allow a domain to name a classified population as an Entity-like schema value without inventing a
second identity or duplicating storage. BookOps stores both parts and chapters as ContentNode rows;
its Operations should be able to declare Chapter input directly instead of accepting slug paths
and a parallel `inputRefs` contract.

This is distinct from a named Selection. A Selection can describe any changing criterion; a variant
declares a domain classification with an enforceable discriminator and a usable schema contract.
Not every `activeChapters` or date-dependent factory should become a new Entity type.

## Target form (declaration and direct existingRef input now experimental)

```ts
const Part = ContentNode.variant('Part', { discriminator: { type: 'part' } });
const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });

const listThreads = operation({
  input: graphSchema.object({ chapter: graphSchema.existingRef(Chapter) }),
  // output and implementation omitted
});
```

The operation accepts a Chapter, independent of how the caller selects it. The contextual factories
from 120b can then target Part/Chapter instead of unclassified ContentNode selections. A UI can guide
Book → Part → Chapter, or Book → root Chapter, without embedding either journey in the Operation.

`existingRef` already exists and materializes before the Operation body. Use it only where that
existence/materialization contract is desired. Deferred Selection inputs and direct mutation
assembly remain distinct consumers; this plan must not reintroduce read-then-write for them.

## Invariants

- ContentNode and Chapter views of the same row share one canonical base identity in Refs, cache,
  invalidation and mutation deltas. A variant name is not a new identity namespace or a new table.
- Variant membership is validated by the receiving runtime, including after transport. A caller's
  label cannot turn a Part reference into a Chapter or bypass base/variant policies.
- Narrowing preserves base contracts. Reflection distinguishes base identity, variant name,
  discriminator and narrowed fields. Define assignability in both SDK types and schema parsing.
- Mutable discriminators require an explicit lifecycle decision: transitions affect variant
  membership and cached classification, not canonical identity. Do not silently allow arbitrary
  transitions through generic updates.
- Fields narrowed by a discriminator must be sound at runtime. Start with a fixed scalar enum
  discriminator; defer general predicate subtyping, multiple inheritance and ORM mapping strategies.

## Execution slices

1. Contract experiment: base/variant schema values, construction, assignment and canonical identity.
   Test zero/one/wrong-kind references and both contextual and direct selections. Choose fixed versus
   mutable classification semantics before exposing write behavior.
2. Core/runtime: discriminator validation, receiver authorization, existingRef materialization and
   deferred Selection consumers. Define failure codes for not-found, wrong-variant and denied access
   without leaking unauthorized existence. Keep one schema-native input declaration.
3. Storage/cache: same physical mapping and canonical ref, variant-aware reads and invalidation,
   correct mutation deltas and supported transition behavior. Test base and variant aliases together.
4. Discovery/codegen/language/UI: preserve base identity and variant typing through generated clients;
   expose Chapter as a schema target and navigable result in both dialects. UI selection paths reuse
   declared model navigation rather than handwritten metadata.
5. BookOps migration rehearsal: contrast current location resolver behavior with actual Chapter
   existence. Review `listThreadsForChapter` output and audience policies separately; after an Ontahi
   release, migrate one Operation and its callers, removing redundant slug/inputRefs/path metadata
   only where the replacement has been proven.

## Acceptance

- [x] Declaration and usage proof distinguishes a variant from a named Selection and a View.
- [ ] Base and variant values use the same canonical identity, storage and normalized cache record.
- [ ] Input/output schemas and SDK assignability enforce discriminator membership on the receiver.
- [ ] Base/variant policy composition and existence/error disclosure are explicitly tested.
- [ ] Existing-ref materialization and deferred Selection consumers retain distinct semantics.
- [ ] Discriminator writes/transitions are explicitly supported or explicitly rejected.
- [x] Factories can target variants without repeating their discriminator predicates at call sites.
- [ ] Reflection, generated clients and both language projections preserve the contract.
- [x] REPL introspection/autocomplete discover variants, narrowed inherited fields and factories from
      the canonical reflected contract, consistently across both dialects and incomplete drafts.
- [x] BookOps rehearsal documents the changed existence semantics and the release/adoption boundary.

## Verification and boundaries

Use colocated Core runtime/type tests, cache and protocol round-trips, generated artifact execution,
provider integration and a small UI proof. No full Hibernate-style inheritance hierarchy, new table
per variant, broad BookOps upgrade, universal locator removal, or Command language rollout in this
plan. Keep 120b usable with ordinary ContentNode Entities before beginning this implementation.

## Contract experiment — 2026-09-12

120b merged in PR #153. The first 152 slice is test-local in
`packages/core/src/data-graph/entity-variant-research.test.ts`; no public Entity API is added.

The experiment declares Chapter/Part using a fixed `type` enum member, derives a narrowed value
schema from the base fields, and lowers classified membership to an ordinary ContentNode Selection.
It composes both direct filtering and contextual Book → nodes traversal without reading first.
The schema rejects the other classification and retains base field validation; TypeScript narrows
the parsed value's discriminator. It does **not** yet type a Selection or Ref as a variant.

### Findings and chosen direction

- **Two roles, not two identities.** `Chapter` is a schema/classification target; `ContentNode`
  remains the canonical identity and storage target. Existing Ref normalization and storage lookup
  use `entity.name`. Simply cloning/renaming an Entity creates a different cache key and reads a
  different population. Keep canonical Refs base-named; preserve the required classification in
  the receiving input schema, not an unchecked caller label.
- **Receiver constraint, not factory expansion alone.** A test receiver validates portable base
  membership, intersects the required discriminator and independent base/variant scopes outside
  caller union/complement, then executes against the real in-memory runtime. Missing, wrong-kind
  and scoped-out references share an unavailable error in this proof. These are experiment-local
  checks, not yet the Graph Read dispatcher or Operation `existingRef` integration.
- **One normalized record.** Lowering to the base allows existing cache writes, updates and
  invalidation to address the same record. This does not prove future variant-aware cache schema
  handling or SQL/provider behavior.
- **Ref assignment is not membership evidence.** A canonical base ref may be offered to a Chapter
  input; the receiving runtime must establish Chapter membership. A Chapter value is assignable
  to the base value; the reverse requires validation. Current `existingRef(ContentNode)` metadata
  carries no classification and ref parsing alone accepts a Part identity. A new schema-native
  target contract is necessary; a custom resolver per application is not the intended solution.
- **Start fixed/read-only.** The first public contract should reject generic discriminator updates
  through both base and variant paths; mutable transitions need a separate explicit lifecycle.
  This experiment exposes no variant write facade and implements no production write guard.
  It simulates an external reclassification to prove that old refs must be checked again and that
  canonical identity does not change. General base updates remain unchanged for now.

### Next bounded slice (reordered by the selectable-universe checkpoint below)

Add receiver-owned classification metadata and a base-identity-aware schema target to Core,
initially for one required scalar enum discriminator. Prove declaration validation, narrowed
value typing and base/variant Ref assignment, then integrate `existingRef` materialization with
the existing Operation boundary. Do not expose an ordinary renamed Entity whose reads, policies,
cache keys or mutations silently use a new namespace. Reject unsupported paths until wired.

Deferred Selection inputs still carry deferred membership and must not be materialized as an
incidental effect of classification. Storage/cache integration, public reflection/codegen,
both language dialects and BookOps migration remain the later slices listed above.

Validation on Node 24: the 12 new experiment cases and all 1,032 Core tests passed. Core
typecheck, build, lint, changed-file formatting and whitespace checks passed. An empty Changeset
records the test-only package scope. No SQL/provider, HTTP, generated client or UI verification
is claimed for this slice; it changes no public runtime code.

## Selectable-universe checkpoint — 2026-09-12

The user's polymorphism question changed the next slice: prove `all/where/by` and set composition
before integrating `existingRef`. A discriminator cannot be just an ordinary filter subsequently
negated by `not`: the complement must stay inside the classified universe.

```ts
const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
const otherChapters = Chapter.where(node => node.title.eq('Intro')).not();
const read = otherChapters.many();
// base ContentNode WHERE type = chapter AND NOT(title = Intro)
```

The experimental public `EntityVariant` is deliberately a local read surface with `kind:
'entity-variant'`, not an ordinary renamed `kind: 'entity'` accepted by unwired schema/provider
registries. It retains the original base object. `VariantSelection` keeps relative membership
separate, reuses the existing Selection algebra, and applies the classifier when lowering to a
Query. `all`, `where`, `and`, `or`, `not`, base-declared `by`, canonical references and explicit
`from(baseSelection)` compose without reads. Narrowed result/predicate types preserve inherited
fields; ordinary read-intent/cardinality/order/limit implementations are reused.

Cross-variant/base unions require explicit narrowing rather than implicit population widening.
No named factories are invented for identity. The base must already declare the chosen `by`
factory. `from` supports contextual membership but not intermediate exact-one/read shaping.
Typed contextual factory outputs directly targeting a variant are still pending; the explicit
`Chapter.from(BookSelection.through('nodes'))` proof does not claim `.chapters` integration.

Public variant/Selection JSON serialization fails explicitly. `toQuery()` is an explicit lowering
to base semantics, not transport preserving a variant schema target or variant authorization.
Use the base for Ref creation/cache writes; accidental `createEntityRef(Chapter, ...)` fails
instead of silently creating a Chapter identity namespace. No writes are exposed by the variant
selection; existing base Commands, including discriminator updates, remain unchanged.

Next slice at this checkpoint: receiver-owned variant schema targets, canonical Ref assignability and
`existingRef` integration. Enforce classification plus base/variant authorization at that boundary;
do not trust this authoring facade or an expanded client predicate. Before enabling variant writes,
define and enforce guards on discriminator updates through both base and variant paths.

Validation: all 1,047 Core tests (15 new selectable-universe cases plus the 12 earlier research
cases) and 126 codegen tests passed. Core coverage gates passed; the new variant module has full
line/function coverage. Core build/lint, root script lint, all package and Todo/Classroom typechecks,
repository formatting, and clean-room tarball type/runtime verification passed. The artifact proof
executes complement and wrong-kind Ref reads using only published entrypoints. No live SQL,
variant-specific receiver authorization, generated variant declarations or Console UI support
is claimed. A Core patch Changeset records this experimental read surface.

## Classified Operation participant checkpoint — 2026-09-12

The local read slice was committed as `a254a2a`. `graphSchema.existingRef(Chapter)` now accepts a
canonical ContentNode Ref as client input and narrows the materialized Operation participant to
`type: 'chapter'`. Resolution uses the existing base runtime or host-provided resolver. Before the
body, the receiver checks classification, canonical identity and the complete base record schema.
Custom resolvers retain these checks; they cannot replace the record with an arbitrary DTO.
Optional/nullable direct fields work; nested participants and stored variant Reference Fields
remain explicitly unsupported. A previously resolved base participant is not membership proof.

Missing, wrong-kind, wrong-identity and host-filtered inaccessible records share `entity_not_found`.
This proves the classification gate and scoped resolver behavior, **not** automatic base/variant
policy composition in the Graph Read dispatcher. Hosts still own visibility/authorization through
the existing resolution boundary. No new policy registry or deferred Selection consumer is added.

`Chapter.descriptor` and reflected Ref/JSON Schema contracts expose the variant name, base Entity
name and discriminator separately from canonical identity. Returned descriptor copies cannot alter
the receiver requirement. Codegen now diagnoses unsupported generated variant Operation inputs
instead of emitting an unbound `Chapter` identifier. This does not yet generate variant declarations.

### Next bounded slice

Carry this descriptor into discovery and generated client declarations, then make the REPL consume
that canonical contract for introspection and autocomplete in both dialects. Resolve base Fields
and factories through the base Entity descriptor and narrow the discriminator to the variant value.
Completions must work on incomplete drafts, without requiring a prior execution, and must not offer
variant roots until the receiver supports their read contract. Do not duplicate semantic completion
rules in each dialect. Typed contextual factory targets and receiver policy composition remain
explicit remaining work; no REPL UI implementation is claimed by this checkpoint.

Validation: all 1,059 Core tests (12 new participant cases) and 129 codegen tests passed. Core
coverage gates, Core build/lint, codegen lint/types, package and example typechecks, repository
formatting and root script lint passed. Clean-room tarball installation/type/runtime verification
executes both successful Chapter materialization and wrong-kind rejection using public entrypoints.

## Operation discovery/codegen checkpoint — 2026-09-12

Graph `describe()` now includes each graph-native Operation input descriptor, including variant
classification separately from canonical Ref identity. Codegen analyzes local/imported literal
`existingRef(Chapter)` inputs (including import aliases and optional/nullable direct wrappers),
records the classification as data, and reconstructs it on the generated base schema. Custom
`resolveWith` implementations are not emitted. The same serializable input contract is observable
on server and generated-client discovery. Operation config shorthand `{ input }` now preserves the
contract; a generated-module type test exposed its previous omission.

This closes **Operation input projection**, not the full variant discovery/read surface. The base
must be included in the generated graph and resolve to a supported Entity declaration. Opaque
classifiers, portable `ref(Variant)`, portable conditions on variant inputs and named Values containing
variants are explicitly rejected; condition compilation still needs canonical base/variant symbols.
No standalone Chapter export, contextual variant target or remote variant read root is added.

Next: expose registered variants as discoverable read targets with receiver semantics, then connect
the shared language reflection/completion model to both REPL dialects. Keep canonical base identity,
inherited Fields/factories and narrowed enum values; completions must work on incomplete drafts
before any execution. This turn deliberately stops at the generated input boundary instead of
advertising read roots that the receiver does not yet understand. The REPL remains unchanged.

Validation: 1,059 Core tests and 137 codegen tests passed, including semantic TypeScript validation
and execution of a generated browser module with imported/aliased variant inputs. Core/codegen
coverage gates passed, as did builds, package/example typechecks, lint and repository formatting.
Clean-room artifact verification includes the classified input descriptor in graph discovery and
the receiver's successful/wrong-kind materialization paths. No REPL/browser UI proof is claimed.

## Registered read roots and shared REPL checkpoint — 2026-09-12

The Operation input/discovery/codegen work was committed as `3b9796e`. A base `GraphReadPolicy` now
accepts `variants: [Chapter]`. Registrations must be actual variants of that exact base definition;
ambiguous root names and fabricated descriptors are rejected at setup. Graph Read keeps its
existing request shape and can address the registered Chapter root by name. The receiver resolves
the base policy, authorizes caller membership, then adds classification and the existing authority
scope outside caller NOT/OR. Execution/observation use the base Query and canonical base Refs.
Filter/order grants, modes, cardinalities and limits are inherited, never widened by registration.

Graph Read capability metadata advertises the canonical variant descriptors without materializing
rows. The Console requests metadata for all configured base Entities, projects variants over base
reflection and autocompletes roots, inherited Fields, narrowed enum values and declared `by`
factories in both TS and declarative dialects. Dialect adapters share the root catalog and existing
semantic assistance; no dialect-specific classification logic is added. Factory inputs expand
against the base contract while the outgoing request retains Chapter as its required read root.
The server, not the editor, adds the classifier.

The discovery catalog is scoped to transport, effective route and execution identity, with late
responses discarded. Failed base lookups do not discard other successful roots. Result ordering and
source edits reuse the owning base capability policy. Colocated React/CodeMirror integration tests
exercise actual root autocomplete before Run, then classified reads and table-driven ordering
through a real dispatcher in both dialects; this is an automated DOM proof, not a live browser demo.

Boundaries remain explicit: no separate variant-specific policy/grant, standalone generated variant
export, variant-root View, variant contextual navigation/target, write/transition lifecycle or
deferred Operation Selection input. `existingRef` still uses its own host-owned materialization and
authorization boundary. No Todo/BookOps domain schema is changed merely to manufacture a variant.

Next bounded slice: let contextual Selection declarations target a variant (for example Book.parts
and Part.chapters), preserving classification and canonical identity through typed authoring,
reflection, receiver relation membership and both Console dialects. Avoid implementing navigation
only in the editor; prove receiver-side composition before advertising those hops. Cache/provider
transition tests and the BookOps migration rehearsal remain separate pending acceptance work.

Validation: 1,067 Core, 335 Language and 107 Devtools tests passed with coverage gates; 137 codegen
and 70 CodeMirror tests passed. Builds,
all package and Todo/Classroom typechecks, and touched-package lint passed. The clean-room artifact
verification passed, including capability discovery, shared autocomplete, both dialects and a
serialized NOT read against the classified receiver using published entrypoints. Repository
formatting and root script lint also passed.

## Classified contextual destinations checkpoint — 2026-09-12

The registered-root/REPL slice was committed as `a15e945`. Contextual factories now support
`parts: self.nodes.as(Part)` and `chapters: self.children.as(Chapter)`, optionally after an ordinary
`where` declaration. `as` names a classifier of the exact physical relation target; a foreign
variant is rejected. The factory descriptor names its output variant while retaining the relation
and deferred target membership. No new relation or copy of the discriminator is required at use sites.

`Selection.where(Book, ...).parts.chapters.many()` and the Console's `Book.parts.chapters.many()` /
`Book through parts through chapters many` retain source membership and narrow the result. Variants
inherit contextual declarations from their base. Codegen projects static `.as(Variant)` declarations
to validated portable templates using the shared variant-contract analysis; generated modules are
typechecked and executed, including self-referential ContentNode → children relationships. No
server declaration/closure is copied to the generated browser module.

Graph Read v2 preserves registered variant names at each nested Selection source and the final root.
The receiver first normalizes names to validate caller membership against base policies, then imposes
classifiers outside caller Boolean expressions and applies base scopes at each hop. Classifiers do
not require caller filter grants; ordinary factory predicates still do. Unknown variants, foreign
targets and denied source relations fail without a downgraded data read. V1 flat reads remain valid;
v2 observation and variant-root Views remain outside this slice.

Console completion uses one shared destination resolver, including inherited contextual names and
narrowed enum values on incomplete drafts. Result ordering now selects capabilities **after** the
full discovered path resolves, so Chapter fields/permissions are not taken from Book. React tests
exercise actual autocomplete, a real receiver, classified rows and table-driven source edits in both
dialects without a preliminary data read. The packed-consumer fixture repeats multi-hop execution
through the public language and Core entrypoints.

Important boundary: classified hops return **unbound read-only VariantSelections**, even from a
bound source. They intentionally bypass the ordinary mutable bound Selection wrapper; execute their
final Query with a runtime. This does not promise bound `.run()`/observation or permit variant writes.
No BookOps/example schema migration, extra variant-specific authority policy, standalone variant
export or discriminator lifecycle is introduced here.

Next bounded work: integrate read-only variants with runtime-bound read consumers and prove canonical
cache/provider behavior before the BookOps migration rehearsal. Keep explicit materializing
`existingRef` distinct from deferred Selection inputs, and settle classification transitions before
opening variant Commands. The broad plan remains current; the factory acceptance item is now closed.

Validation: all 1,073 Core, 337 Language, 140 codegen and 109 Devtools tests passed with coverage
gates. Public package builds, all package and Todo/Classroom typechecks, touched-package lint,
root script lint and repository formatting passed. Clean-room tarball installation, type and
runtime checks passed, including the two-dialect classified multi-hop proof. No live SQL server,
normalized-cache variant integration or BookOps migration is claimed by these tests.

## Read-only runtime binding checkpoint — 2026-09-12

`api.bindVariantSelection(Chapter.all())` adds execution without converting classified membership
to the mutable bound Selection facade. Classified destinations reached from either bound semantic
Selections or bound Query selections retain the same read runtime. `where`/`and`/`or`/`not`, further
classified hops, `many`, `orderBy` and `limit` retain binding and narrowed result types. Terminal
read expressions keep their data contract and gain `.run(options)`; `.exec()` delegates streaming
and supported observation to the existing runtime. No row reads occur while composing or creating
Effects, and the runtime is resolved at execution. Exact-one errors and `one` plus `limit(0)`
rejection remain owned by the existing runtime cardinality boundary.

`toQuery()` is explicitly an unbound base read, not a new variant storage/identity namespace.
In-process tests execute base and classified reads, reconcile both through the real normalized
cache, compare canonical refs, invalidate the shared record, and reject a cached non-member base
reference as classified membership. Cache scope/lifetime and invalidation subscriptions remain
host-owned. This proves Core normalization, not an integrated SQL or React provider transition
lifecycle. Ordinary non-classified destinations from a variant still return unbound Selections.

The packed consumer exercises bound reads, terminal intent execution, canonical cache writes and
public types with negative write/narrowing checks. No Commands, variant-root Views, standalone
generated variant export, remote v2 observation or BookOps schema migration is introduced.

Next: provider-level observation/invalidation and classification-change acceptance tests, followed
by the BookOps migration rehearsal. Keep discriminator lifecycle and deferred Operation inputs
separate from this read-only execution slice.

Validation: 1,077 Core tests passed with coverage gates; 337 Language, 109 Devtools and 140 codegen
tests passed. Core build/lint, all package and Todo/Classroom typechecks, repository formatting
and clean-room tarball install/type/runtime checks passed. Committed together with the preceding
classified-contextual-destinations slice as `37b92b2`.

## Provider lifecycle acceptance checkpoint — 2026-09-12

The in-process proof now connects two runtimes from shared in-memory storage to the real read
observer/dispatcher, Runtime Transport bridge, Runtime Graph client, normalized cache and React
provider. A host-side base update simulates `chapter → part → chapter`; these tests do not introduce
a supported variant write or transition API. Scoped base and classified observations recalculate
membership, ordering and limits. The hidden principal's rows never enter either result or cache.
Both readers update one base identity. A departure from Chapter does not evict a still-existing
ContentNode, and disappearance from a snapshot does not invent a global delete event. Confirmed
deletion remains an explicit host invalidation.

React hooks keep separate base/variant/scalar query keys under the canonical base Entity prefix.
Invalidating that prefix refetches base rows, sibling variants, `count` and `exists`; Entity-cache
notifications remain a distinct subscription. Hooks do not silently turn into observation streams.

The integration exposed a generic cancellation defect: an idle async generator queues `return()`
behind its pending `next()`, preventing subscription release. Each remote read subscription now owns
an AbortSignal passed separately from caller options to `observeTransport`. Cancellation aborts it
before waiting for iterator closure. The React Runtime Transport adapter forwards that signal.
Regression tests cover idle cancellation, independent subscriptions, finite/early completion,
transport/setup failure and iterators without `return`. Transports must honor cancellation.

Next: rehearse BookOps adoption and document exact migration boundaries. Live SQL/provider change
feeds, mutable-discriminator domain policy, variant-root Views, remote contextual observation and
deferred Operation Selection inputs remain separate pending work. The broad plan stays current;
the in-memory/React lifecycle evidence is not a blanket claim about every storage provider.

Validation: 1,080 Core and 119 React tests passed with coverage gates; Core/React builds and lint,
all package and Todo/Classroom typechecks, repository formatting and clean-room tarball
installation/type/runtime verification passed. The artifact proof also checks observation lifetime
release through published Core entrypoints. Committed as `0af23b2`.

## BookOps adoption rehearsal checkpoint — 2026-09-12

The [rehearsal report](../../docs/research/bookops-chapter-variants.md) records the actual host
checkout, including its preserved local changes and `0.1.0-alpha.3` dependency pins. An executable
Core fixture declares root/nested Chapter navigation and one schema-native `existingRef(Chapter)`
Operation input. It derives repository slugs on the server, preserves state filtering and tests
duplicate slugs across Parts, empty/missing/wrong-kind/inaccessible Chapters and broken hierarchy.
BookOps source, dependencies, generated client and local changes remain untouched.

The key migration change is **existence**, not syntax: the old path resolver checks Book/Part but
does not load the Chapter, and returns a location DTO. It cannot implement the new complete-record
participant contract. The existing Reader's separate ChapterNode/SectionNode declarations also
cannot be replaced blindly: their read shapes, typed children and identity names differ. Named
Values containing variant inputs, generated standalone variants and variant-root Views remain gaps.
The guided Explorer picker is separate from the Operation input; do not remove path hints without
an interaction replacement or an explicit acceptance of that loss.

Combining `.parts.chapters` and `.rootChapters` exposed a public type mismatch across fluent base
enrichment. Contextual `as` now retains the variant's own base type, while the receiver-side factory
still requires exact target object identity. Core and packed-consumer fixtures cover pre-enrichment
classifiers alongside enriched targets; a structurally identical second base object is rejected.
This is a narrow authoring fix, not new variant inheritance or a second identity namespace.

The low-level raw Operation runner is not an input-validation ingress. Deferred classified
Selections fail input schema parsing/serialization; callers must not bypass that boundary by
passing arbitrary objects directly to the raw runner. No deferred Selection participant API was
introduced. Participant authorization remains host-owned and separate from Graph Read policy.

Next: review the remaining read-only acceptance gaps before calling 152 complete or upgrading the
host. Prioritize a generated semantic-entity declaration/adoption proof (including named input
Values), then the Reader/View and guided-input interaction decisions. Keep generic discriminator
write guards/transitions, SQL provider lifecycle and deferred Operation inputs explicit, separate
work rather than claiming this in-memory rehearsal closes them. A release plus one coordinated
Operation/caller migration remains the BookOps adoption boundary.

Validation: all 1,097 Core tests passed with coverage gates, including 16 BookOps rehearsal cases
and the fluent-enrichment regression. All 140 codegen and 337 Language tests passed. Public package
builds, all package and Todo/Classroom typechecks, Core lint, root script lint, repository formatting
and whitespace checks passed. Clean-room tarball installation/type/runtime checks exercise both
direct and nested classified destinations. This rehearsal and its narrow authoring fix are included
in the read-only variants PR scope below; no real BookOps execution or database migration is claimed.

## Named input projection and release gate checkpoint — 2026-09-13

The follow-up supports named `value('ListThreadsForChapterInput', { chapter:
graphSchema.existingRef(Chapter), ... })` contracts without replacing them with anonymous objects.
Local, inline and imported/aliased declarations retain their Value name, shared schema identity,
canonical ContentNode Ref and classification descriptor. Projection reuses the existing static
variant analysis; no resolver closure crosses into browser code. Semantic Entity fixtures include
Book.parts.chapters and Book.rootChapters alongside the Operation input. Generated modules are
typechecked and imported, not merely inspected as source text. Portable refs and conditions remain
rejected; nested participants and standalone generated variant exports are not added.
The root-navigation proof also exposed missing `isNull()` compilation in contextual declarations;
it now emits the existing null-test AST without a value argument or copied callback.

**User-directed pause before BookOps migration:** close/review this Ontahi slice, then reconcile the
accumulated Changesets with Plans, Atlas, developer docs and executable package contracts before
preparing the release. Inventory both the last published release → candidate and BookOps's pinned
version → candidate; the latter can include changes already published in intermediate versions.
Use the [release documentation gate](../../RELEASING.md#developer-documentation-gate) and the
[adoption checklist](../../docs/research/bookops-chapter-variants.md#release-and-adoption-boundary).
Do not infer permission to publish, merge the generated release PR, bump versions or update BookOps
from approval to continue this codegen work. Review the inventory/scope with the user first. The
actual host migration starts only after the approved Ontahi release exists at an exact version.

Plan 152 remains current: Reader/View and guided-input decisions, write/transition lifecycle,
provider-specific lifecycle and deferred Operation inputs are still explicit boundaries. The next
step is release reconciliation, not another unbounded BookOps implementation slice.

Validation: all 147 codegen tests passed with coverage gates, including generated-module type/runtime
proofs and a shared Value first used by a server-only Operation (its resolver must not reappear in
browser output). Codegen build/types/lint, Todo/Classroom codegen checks and typechecks, repository
formatting and root script lint passed. Clean-room tarball verification also executes the installed
codegen and imports its generated named participant schema using the installed Core entrypoint.
No release, version bump, dependency upgrade or BookOps source change was performed.

## Read-only variants PR boundary — 2026-09-13

The user approved submitting the accumulated variant work for review before considering a release.
The PR delivers the experimental read-only classification surface, schema-native existing
participants, discovery/codegen (including named Values), both Console dialects, contextual and
bound reads, and the in-memory/React lifecycle and BookOps rehearsal evidence above.

This does not close the broader acceptance list. Generic base Commands remain unchanged; there is
no variant mutation API or enforced discriminator-transition lifecycle. Variant-root Views,
standalone generated variant exports, variant-specific policy composition, provider-specific live
change feeds and deferred classified Operation inputs remain outside this PR. The host-owned
materialization boundary is distinct from Graph Read policy. Plan 152 therefore remains current.

After PR review/merge, pause for the release reconciliation described above. Submitting this PR
does not authorize publishing, merging the generated release PR or migrating BookOps.
