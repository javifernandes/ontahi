# 136i. Relation Constraint Evolution

Status: backlog

Canonical ID: `ontahi://plans/136i-relation-constraint-evolution`

Source plan: [136. Relation Constraints And Eligibility Semantics](../done/136-relation-constraints-and-eligibility.md)

## Summary

Extend the established Relation constraint model only when concrete applications require
many-to-many aggregate rules or useful advisory preflight. Keep authoritative enforcement and
client guidance distinct.

## Scope

1. Define aggregate constraints over many-to-many membership without weakening atomicity.
2. Define advisory evaluation as `allowed`, `denied`, or `unknown` from explicitly available graph
   evidence.
3. Reflect safe reasons and missing-evidence diagnostics for Explorer, agents, and headless UI.
4. Prove the semantics in memory and one provider before expanding the public vocabulary.

## Non-Goals

1. Do not move permanent Entity invariants into Relation constraints.
2. Do not make advisory client evaluation authoritative.
3. Do not infer policy permission from structural eligibility.

## Acceptance Checklist

- [ ] One real many-to-many aggregate rule has explicit prospective-membership semantics.
- [ ] Authoritative enforcement is atomic with the edge mutation.
- [ ] Advisory evaluation distinguishes denial from unavailable evidence.
- [ ] Reflection exposes stable, safely redacted diagnostics.
- [ ] Provider limitations fail closed.
