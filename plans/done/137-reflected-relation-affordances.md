# 137. Reflected Relation Affordances For Explorer, Agents, And Headless UI

Status: done

Canonical ID: `ontahi://plans/137-reflected-relation-affordances`

Depends on: [136. Relation Constraints And Eligibility Semantics](./136-relation-constraints-and-eligibility.md)

Completed child: [137a. Read-Only Relation Explorer](./137a-read-only-relation-explorer.md)

Completed child: [137b. Instance-First Explorer Workspace](./137b-instance-first-explorer-workspace.md)

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
   optimistic reconciliation from Relationship Deltas plus Applied Outcome identity. Define
   command/outcome correlation, duplicate suppression, and out-of-order handling through Plans 135
   and 132. Revision metadata is used only when the runtime guarantees it; the Delta remains the
   canonical relation, source, target, added, and removed facts.
7. Represent Association Entity classification unambiguously through explicit role metadata or
   `unknown`. Required participant Refs, identity, and locators are useful evidence but never enough
   to classify an ordinary Entity automatically. This role is metadata, not a subtype or shared
   mutation lifecycle.

## Non-Goals

1. Do not build a final visual design system in Core.
2. Do not expose inaccessible Entity fields or population facts through reflection.
3. Do not let reflected affordances bypass runtime policy.
4. Do not collapse Association Entity lifecycle into primitive Relation mutation.

## Execution Slices

1. [137a. Read-Only Relation Explorer](./137a-read-only-relation-explorer.md) reflects and
   presents static Relation semantics, portable Ref identity, and authorized Query-backed related
   data without depending on Plan 136 or exposing mutation affordances.
2. [137b. Instance-First Explorer Workspace](./137b-instance-first-explorer-workspace.md) makes
   authorized instances and graph traversal the primary automatic application surface while
   keeping access scope under runtime policy.
3. [Plan 136](./136-relation-constraints-and-eligibility.md) contributes portable
   eligibility, stable rejection metadata, provider enforcement, and exact Relationship outcomes.
4. Plan 78 contributes authority decisions; Plan 128 contributes remote execution; Plan 135 and
   Plan 132 contribute optimistic outcome reconciliation.

## Acceptance Checklist

- [x] One reflected Relation contract is portable across Explorer, agent, and headless consumers.
- [x] Available structural verbs follow cardinality and canonical forward/inverse identity.
- [x] Eligibility rejections have stable, safe, versioned descriptors.
- [ ] Authority-dependent actions remain visibly undecided until evaluated by the server.
- [ ] Optimistic consumers correlate commands and outcomes, suppress duplicates, and handle
      out-of-order delivery using Plans 135/132 without requiring unavailable revision metadata.
- [x] Relationship Deltas preserve canonical relation/source/target and exact added/removed facts.
- [x] Association Entity reflection uses explicit role metadata or remains `unknown`, preserves
      Entity identity, attributes, and lifecycle, and does not misclassify ordinary Ref-bearing
      Entities.
- [ ] A small Explorer proof and a framework-agnostic headless proof consume the same metadata.

## Progress

The first mutation proof landed on 2026-08-30. The Express runtime projects configured
many-to-many `link`/`unlink` policy as `add`/`remove` affordances on both canonical and inverse
Relation descriptors. Explorer instance windows consume that metadata to search currently
unlinked participants, issue canonical Relationship Commands, unlink existing participants, show
server rejection messages, and refresh authoritative related data. This proves the Explorer path
without claiming that static policy presence is a complete per-command eligibility decision.

Advisory eligibility projection in clients, a framework-agnostic headless proof, Relationship
Delta reconciliation, duplicate suppression, and out-of-order outcome handling remain open.

Plan 137b subsequently made the Explorer instance canvas operational: it added cross-Entity
instance windows, reflected Field editing, Query-backed Relation traversal, authorized
many-to-many mutation, contextual Entity Actions, and Relation-local Action projection. This
completed the Explorer proof without turning placement or structural verbs into authorization.

## Open Questions

1. Are affordances static model metadata, runtime capability projections, or a composition of both?
2. Which policy facts can be reflected without creating an authorization oracle?
3. How should generated clients expose affordance metadata without increasing their runtime weight?
4. What is the smallest explicit Association Entity role metadata that improves tooling without
   creating a public subtype?

## Closure And Evolution

Closed on 2026-08-31. The parent plan succeeded at establishing reflected Relation topology,
portable identity, stable eligibility evidence, exact Relationship outcomes, and an authority-aware
Explorer proof. Keeping the umbrella active no longer made the remaining work more coherent.

Unchecked acceptance items remain deliberate historical evidence of deferred scope:

1. explicit `allowed` / `denied` / `requires-server-decision` projection belongs with future
   runtime access-scope diagnostics rather than static Explorer inference;
2. a framework-agnostic headless proof should be cut from a concrete consumer instead of extending
   this Explorer-led intervention speculatively;
3. optimistic correlation, duplicate suppression, and out-of-order handling continue through
   Plans 135 and 132, with ordered Relation UI and deltas continuing in
   [Plan 145](../next/145-ordered-relations-and-sequence-commands.md);
4. direct Relation and composition lifecycle affordances require a new focused plan when their
   runtime contract is ready.
