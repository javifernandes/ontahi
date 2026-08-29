# 136. Relation Constraints And Eligibility Semantics

Status: current

Canonical ID: `ontahi://plans/136-relation-constraints-and-eligibility`

Completed child: [136a. Portable Participant Eligibility Core](../done/136a-portable-participant-eligibility-core.md)

Completed child: [136b. Many-To-Many Participant Eligibility](../done/136b-many-to-many-participant-eligibility.md)

Completed child: [136c. PostgreSQL Direct Relation Compare-And-Set](../done/136c-postgres-direct-relation-compare-and-set.md)

Completed child: [136d. Supabase Direct Relation Compare-And-Set](../done/136d-supabase-direct-relation-compare-and-set.md)

Completed child: [136e. PostgreSQL Relation Participant Eligibility](../done/136e-postgres-relation-participant-eligibility.md)

Completed child: [136f. Supabase Relation Participant Eligibility](../done/136f-supabase-relation-participant-eligibility.md)

Completed child: [136g. Portable Relationship Command Outcomes](../done/136g-portable-relationship-command-outcomes.md)

Completed child: [136h. Authority-Serialized Relation Count Constraints](../done/136h-authority-serialized-relation-count-constraints.md)

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
4. A constraint rejection is a versioned, canonical JSON-safe descriptor with a stable code, safe
   parameters, and explicit redaction rules, not an arbitrary thrown exception.
5. Constraints apply equally to forward and inverse authoring because both normalize to one
   canonical Relation identity.
6. Client or preflight evaluation is only guidance. Every state-dependent constraint is enforced or
   re-checked inside the same transaction or serialization boundary that applies the Relationship
   Command.

## First Slice

1. Inventory eligibility examples across to-one, inverse to-many, and many-to-many Relations.
2. Define a minimal AST by reusing Selection predicate vocabulary where its semantics truly match.
3. Define evaluation inputs, missing-data behavior, and stable rejection reasons.
4. Evaluate the same constraint before in-memory Relationship Command application.
5. Re-check state-dependent constraints atomically with adapter-backed mutation rather than relying
   on a time-of-check/time-of-use preflight.
6. Define concurrent conflict detection and whether each conflict fails, retries under a bounded
   policy, or returns a structured stale/conflict outcome.
7. Reflect constraints and rejection descriptors without leaking confidential values or
   authority-only facts.
8. Prove forward/inverse normalization and Selection-valued batch behavior.

## Non-Goals

1. Do not add arbitrary Relation lifecycle callbacks.
2. Do not treat browser validation as a security boundary.
3. Do not absorb Principal authorization from Plan 78.
4. Do not make every Domain Operation invariant declarative.
5. Do not promise that all predicates can be decided without reading current graph state.

## Acceptance Checklist

- [x] Constraints have a canonical JSON-safe representation.
- [x] The model distinguishes eligibility, authorization, and coordinated domain invariants.
- [x] Server execution remains authoritative and default-deny policy still applies independently.
- [x] Rejections use a versioned, canonical JSON-safe descriptor with a stable code, safe
      parameters, and explicit redaction rules shared by Explorer, agents, and headless UI.
- [x] Forward and inverse commands enforce the same canonical constraints.
- [x] Batch commands define all-or-nothing, empty-selection, and affected-set semantics explicitly.
- [x] State-dependent constraints are enforced atomically with mutation; concurrent conflicts have
      explicit detection, retry, and failure semantics.
- [x] At least one adapter-backed proof evaluates and enforces eligibility without provider-specific
      model syntax.

## Open Questions

1. Which Selection predicates are safe and meaningful as participant eligibility constraints?
2. Does evaluation require candidate fields, current related population, aggregate counts, or all
   three?
3. How does a UI distinguish definitely allowed, definitely denied, and server-decision-required?
4. Can constraints expose parameterized reasons without leaking inaccessible graph facts?
5. Which constraints compile into guarded storage statements and which require coordinated reads?
6. Which conflicts are safe to retry automatically, and which require a caller-visible decision?

## Progress

Plan 136a landed portable source/target participant Selection constraints, stable versioned
rejections, static reflection, and authoritative in-memory enforcement shared by forward and
inverse authoring. Plan 136b extended the same contract to Selection-valued many-to-many links with
all-or-nothing in-memory evaluation and a Todo proof. Plan 136c added the first provider-backed
direct Relation mutation and atomic expected-current conflict proof in PostgreSQL; Plan 136d
preserved it through one Supabase invoker-rights RPC without a PostgREST read/write race.

Plans 136e and 136f compile the existing participant Selection vocabulary into PostgreSQL and
Supabase direct and many-to-many mutation boundaries. One Core resolver maps declaration-relative
forward/inverse participants to the canonical command. Providers lock the complete selected
participant rows, evaluate every constraint without narrowing the affected set, preserve the first
stable rejection descriptor, and guard the edge mutation. Supabase uses payload version 2 only for
constrained links, so an older RPC fails closed; unconstrained and unlink commands retain version 1
compatibility. Plan 136g carries stable precondition and constraint diagnostics through the remote
Graph Command boundary and distinguishes applied empty deltas from explicit skipped
preconditions.

Plan 136h adds the first current-population rule:
`relationConstraint.countAtMost(fieldName, rejection)` on a direct to-many Relation. In-memory
execution evaluates prospective membership. PostgreSQL starts or reuses an explicit
`READ COMMITTED` transaction, serializes additions on the destination endpoint, and evaluates from
a fresh statement snapshot; concurrent last-seat admissions therefore yield one commit and one
stable rejection without implicit retry. Supabase fails closed for the unsupported requirement.
Many-to-many aggregates, advisory preflight, and a permanent Entity invariant covering generic
limit/Reference Field writes remain open.
