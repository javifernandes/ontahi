# 120. Named And Saved Selections

Status: backlog

Canonical ID: `ontahi://plans/120-named-and-saved-selections`

Migrated from: `bookops://plans/120-named-and-saved-selections`
Original path: `plans/backlog/120-named-and-saved-selections.md`
Source commit: `a27ef5d1`

Related plans:

1. [116 Ontahí Selection Model](../done/116-ontahi-selection-model.md)
2. [118 Ontahí Selection Language Editor Research](../done/118-ontahi-selection-language-editor.md)
3. [150a Selection Factories, Locators, And Refs](../done/150a-selection-factories-locators-and-refs.md)
4. [120a Pure Named Selection Factory Contract](../done/120a-pure-named-selection-factory-contract.md)
5. [120b Contextual Selection Factories](../current/120b-contextual-selection-factories.md)

## Proposal

Define reusable domain-named selections and persisted user-owned saved selections over the canonical Selection AST.

## Decisions Required

1. Separate code-owned names from user-owned persisted records.
2. Define identity, parameters, versioning, ownership, authority, and migration.
3. Keep saving an expression separate from snapshotting resolved references.
4. Define how Explorer filters and future application surfaces discover and reuse them.

## Non-Goal

Persistence and product UX are useful follow-ups, not prerequisites for evaluating or transporting selections.

## Current Research Link

Plan 150a investigates the code-owned, parameterized factory portion as a possible simplification
of locators before Console Commands. It does not pull saved-selection persistence, lifecycle, or
product UX out of this backlog. Existing `Selection.named()` is a local label, not implementation
of the named factory registry described here.

The completed experiments in 150a recommended pure expansion and preserving canonical identity,
without changing current Ref wire values. The completed bounded proof in 120a implements declaration,
reflection, codegen, Explorer inspection, and Console factory intersections in both dialects. It
does not implement saved-selection persistence or deprecate locators.

## Deferred extensions after 120a

- Factory union/grouping in Console authoring (`or by` and explicit grouping), distinct from the
  shipped intersection syntax. Preserve the authored calls while lowering to existing Selection algebra.
- Composed templates, optional/nested inputs, and any callback authoring sugar that can compile to
  portable data. Hidden state, external I/O, and server-only resolution require separate semantics.
- Schema-driven Explorer invocation/search forms and optional authoring provenance in Activity.
- Representative caller migrations and a compatibility decision before any locator deprecation.
- User-owned persisted selections, ownership/versioning, and product UX from the original scope.

These are deferred, not requirements for completing 120a or starting the subsequent consumer work.

The contextual, source-Selection factory portion is now active in 120b. It takes the BookOps
`Book.parts.chapters` example through membership, runtime and reflective authoring before Entity
variants. Saved selections and the other extensions above remain backlog work.
