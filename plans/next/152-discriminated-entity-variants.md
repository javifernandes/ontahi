# 152. Discriminated Entity Variants

Status: next

Canonical ID: `ontahi://plans/152-discriminated-entity-variants`

Prerequisite: [120b. Contextual Selection Factories](../current/120b-contextual-selection-factories.md)

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

- [ ] Declaration and usage proof distinguishes a variant from a named Selection and a View.
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
