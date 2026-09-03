# 119. Selection Relation Predicates

Status: backlog

Canonical ID: `ontahi://plans/119-selection-relation-predicates`

Migrated from: `bookops://plans/119-selection-relation-predicates`
Original path: `plans/backlog/119-selection-relation-predicates.md`
Source commit: `a27ef5d1`

Related plans:

1. [116 Ontahí Selection Model](../done/116-ontahi-selection-model.md)

## Proposal

Extend the canonical Selection algebra with graph-aware relation predicates such as `some`, `every`, and `none` without importing query shaping into membership.

## Decisions Required

1. Define quantifier semantics for missing and empty relations.
2. Define the typed builder and serializable AST representation.
3. Define provider lowering, authority boundaries, and unsupported-capability behavior.
4. Preserve lossless use by reads, operation targets, and future language editors.

## Non-Goal

This is a useful algebra extension, not a prerequisite for the base Selection model.
