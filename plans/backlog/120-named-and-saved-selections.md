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
4. [120a Pure Named Selection Factory Contract](./120a-pure-named-selection-factory-contract.md)

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

The completed experiments in 150a recommend pure expansion and preserving canonical identity,
without changing current Ref wire values. Plan 120a isolates the resulting optional implementation
proposal; it remains backlog pending review and is not a prerequisite for the two-dialect Read proof.
