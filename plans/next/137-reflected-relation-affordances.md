# 137. Reflected Relation Affordances For Explorer, Agents, And Headless UI

Status: next

Canonical ID: `ontahi://plans/137-reflected-relation-affordances`

Depends on: [136. Relation Constraints And Eligibility Semantics](136-relation-constraints-and-eligibility.md)

## Summary

Project Relation semantics as actionable, authority-aware affordances. Explorer, agents, and a
headless/stylable component layer should understand endpoints, roles, cardinality-specific verbs,
eligibility constraints, and the distinction between direct Relations and Association Entities.

## Scope

1. Reflect canonical Relation identity, named directions, target Entity, cardinality, nullability,
   and structural verbs.
2. Reflect portable constraint ASTs and stable reason descriptors from Plan 136.
3. Represent capability states such as `allowed`, `denied`, and `requires-server-decision` without
   presenting advisory client evaluation as authority.
4. Let Explorer render valid connections and disable invalid graph gestures with an explanation.
5. Give agents the same action vocabulary and evidence rather than bespoke tool descriptions.
6. Define the minimum headless UI contract for relation pickers, connect/disconnect actions, and
   optimistic reconciliation from Relationship Deltas.
7. Explore whether required participant Refs and identity provide enough evidence to reflect an
   ordinary Entity as an Association Entity; add no marker or subtype until inference proves
   insufficient.

## Non-Goals

1. Do not build a final visual design system in Core.
2. Do not expose inaccessible Entity fields or population facts through reflection.
3. Do not let reflected affordances bypass runtime policy.
4. Do not collapse Association Entity lifecycle into primitive Relation mutation.

## Acceptance Checklist

- [ ] One reflected contract serves Explorer, agents, and headless UI consumers.
- [ ] Available verbs follow cardinality and canonical forward/inverse identity.
- [ ] Eligibility explanations are stable and safe to expose.
- [ ] Authority-dependent actions remain visibly undecided until evaluated by the server.
- [ ] Relationship Deltas provide deterministic reconciliation evidence.
- [ ] Association Entity reflection preserves Entity identity, attributes, and lifecycle.
- [ ] A small Explorer proof and a framework-agnostic headless proof consume the same metadata.

## Open Questions

1. Are affordances static model metadata, runtime capability projections, or a composition of both?
2. Which policy facts can be reflected without creating an authorization oracle?
3. How should generated clients expose affordance metadata without increasing their runtime weight?
4. Is Association Entity classification inferable, declared as a role, or purely caller-owned?
