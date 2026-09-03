# 120. Named And Saved Selections

Status: backlog

Canonical ID: `ontahi://plans/120-named-and-saved-selections`

Migrated from: `bookops://plans/120-named-and-saved-selections`
Original path: `plans/backlog/120-named-and-saved-selections.md`
Source commit: `a27ef5d1`

Related plans:

1. [116 Ontahí Selection Model](../done/116-ontahi-selection-model.md)
2. [118 Ontahí Selection Language Editor Research](../research/118-ontahi-selection-language-editor.md)

## Proposal

Define reusable domain-named selections and persisted user-owned saved selections over the canonical Selection AST.

## Decisions Required

1. Separate code-owned names from user-owned persisted records.
2. Define identity, parameters, versioning, ownership, authority, and migration.
3. Keep saving an expression separate from snapshotting resolved references.
4. Define how Explorer filters and future application surfaces discover and reuse them.

## Non-Goal

Persistence and product UX are useful follow-ups, not prerequisites for evaluating or transporting selections.
