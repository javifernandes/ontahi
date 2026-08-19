# 136. Relation Constraints And Eligibility Semantics

Status: next

Canonical ID: `ontahi://plans/136-relation-constraints-and-eligibility`

## Summary

Let a Relation declare portable structural eligibility beyond topology and cardinality. The same
semantic rule should support authoritative server validation, client guidance, reflection,
Explorer affordances, agents, and headless UI without embedding an opaque JavaScript callback in
the model.

```ts
members: relation.hasMany(Member, {
  via: 'teamId',
  accepts: member => member.status.eq('active'),
  max: 10,
});
```

The syntax is provisional. Its result must be a serializable, inspectable AST with stable reason
identity, not an executable closure transported to the server.

## Semantic Boundary

1. Relation constraints own portable structural eligibility: participant predicates, cardinality
   limits, uniqueness, and other facts expressible from declared graph data.
2. Server evaluation is authoritative. Client evaluation is advisory UX and never authorization.
3. Principal-, secret-, external-service-, time-, or coordination-dependent rules belong to Policy
   or Domain Operations unless their inputs become explicit portable semantic facts.
4. A constraint rejection is explainable evidence, not an arbitrary thrown exception.
5. Constraints apply equally to forward and inverse authoring because both normalize to one
   canonical Relation identity.

## First Slice

1. Inventory eligibility examples across to-one, inverse to-many, and many-to-many Relations.
2. Define a minimal AST by reusing Selection predicate vocabulary where its semantics truly match.
3. Define evaluation inputs, missing-data behavior, and stable rejection reasons.
4. Evaluate the same constraint before in-memory Relationship Command application.
5. Reflect the constraint without leaking confidential values or authority-only facts.
6. Prove forward/inverse normalization and Selection-valued batch behavior.

## Non-Goals

1. Do not add arbitrary Relation lifecycle callbacks.
2. Do not treat browser validation as a security boundary.
3. Do not absorb Principal authorization from Plan 78.
4. Do not make every Domain Operation invariant declarative.
5. Do not promise that all predicates can be decided without reading current graph state.

## Acceptance Checklist

- [ ] Constraints have a canonical JSON-safe representation.
- [ ] The model distinguishes eligibility, authorization, and coordinated domain invariants.
- [ ] Server execution remains authoritative and default-deny policy still applies independently.
- [ ] Rejections carry stable, reflectable reasons suitable for UI and agents.
- [ ] Forward and inverse commands enforce the same canonical constraints.
- [ ] Batch commands define all-or-nothing, empty-selection, and affected-set semantics explicitly.
- [ ] At least one adapter-backed proof evaluates eligibility without provider-specific model syntax.

## Open Questions

1. Which Selection predicates are safe and meaningful as participant eligibility constraints?
2. Does evaluation require candidate fields, current related population, aggregate counts, or all
   three?
3. How does a UI distinguish definitely allowed, definitely denied, and server-decision-required?
4. Can constraints expose parameterized reasons without leaking inaccessible graph facts?
5. Which constraints compile into guarded storage statements and which require coordinated reads?
