# 135a. Selection-Valued Many-To-Many Core

Status: done

Canonical ID: `ontahi://plans/135a-selection-valued-many-to-many-core`

## Summary

Prove binary attribute-free many-to-many topology as a direct Relation with Selection-valued
endpoints, exact Relationship Deltas, default-deny dispatch, and direct/remote in-process execution.
No semantic join Entity or provider mapping participates in this Core slice.

## Scope

1. Add `manyToMany` to the Relation kind and server Entity DSL.
2. Add a canonical identity distinct from Reference Field-backed Relations.
3. Author `add/remove` through source and target Entity Refs or Selections.
4. Resolve both endpoint Selections against authoritative Entity datasets.
5. Enforce existence for every explicit Ref while permitting filtered Selections to resolve empty.
6. Apply the Cartesian set delta with repeated add/remove as no-ops.
7. Preserve the command and delta as an Applied Mutation Outcome.
8. Round-trip Selection ASTs through the Graph Command protocol.
9. Require an explicit many-to-many policy and executor at dispatch.
10. Prove identical direct and remote in-process results.

## Non-Goals

1. Do not expose a join Entity.
2. Do not define PostgreSQL or Supabase edge mapping in this slice.
3. Do not implement many-to-many Query materialization through provider join tables yet.
4. Do not migrate Todo until adapter mapping and traversal can preserve the same model.
5. Do not promote associations with attributes or lifecycle to primitive Relations.

## Acceptance Checklist

- [x] Two source and two target participants produce four canonical facts.
- [x] Repeated `add` and `remove` produce empty deltas.
- [x] Missing explicit Refs fail before any fact mutation.
- [x] Empty filtered Selections are valid and produce empty deltas.
- [x] Unknown topology, endpoint Entities, Selection fields, and locators are rejected.
- [x] Missing or disallowed policy denies execution.
- [x] Direct and remote in-process execution preserve the same command and delta.
- [x] Reaction chains preserve a many-to-many child Applied Mutation Outcome.
- [x] Existing Reference Field-backed Relationship Commands remain green.

## Outcome

Core now treats one-or-many participation as Selection semantics rather than a separate batch API.
The join representation is absent from the command and outcome. Provider adapters must supply
edge-aware mapping, traversal, and atomic mutation before Todo removes its legacy `TodoTag` Entity.
