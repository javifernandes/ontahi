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

## Proposed form (illustrative, not an existing API)

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
- [ ] Factories can target variants without repeating their discriminator predicates at call sites.
- [ ] Reflection, generated clients and both language projections preserve the contract.
- [ ] BookOps rehearsal documents the changed existence semantics and the release/adoption boundary.

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

Remaining next slice: receiver-owned variant schema targets, canonical Ref assignability and
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
