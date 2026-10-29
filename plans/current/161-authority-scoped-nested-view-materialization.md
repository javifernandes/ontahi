# 161. Authority-Scoped Nested View Materialization

Status: current

Canonical ID: `ontahi://plans/161-authority-scoped-nested-view-materialization`

## Summary

Define and implement receiver-owned authority scoping for Relations materialized inside recursive
Views. A Graph Read that is authorized to project a Relation must not expose related rows outside
the target Entity's effective policy scope.

This closes a security-significant composition gap discovered while Atlas moved Workspace Settings
onto the unified Runtime Protocol. Atlas currently performs separate authorized Workspace and
Membership root reads because one Workspace View containing `memberships.user` would otherwise
materialize inactive Memberships even though the registered Membership root policy scopes reads to
active rows in the current Workspace.

Consumer evidence: `atlas://plans/139-workspace-members-settings`.

## Current Semantics And Gap

`GraphReadPolicy.scope` is applied to the root Query population. Nested `relations` policy nodes
authorize projection shape and derived-field dependencies, but they do not carry or apply the
target Entity's registered root scope. Consequently, this policy shape is easy to misread:

```ts
const workspacePolicy = {
  entity: Workspace,
  relations: { memberships: membershipPolicy },
  scope: ({ authority }) => Workspace.by({ id: authority.workspaceId }),
};
```

`membershipPolicy.scope` constrains direct Membership roots only. It does not constrain
`Workspace.view({ memberships: { ... } })`. The receiver validates that the View is permitted and
the adapter then materializes the physical Relation without the nested scope.

This is not isolated to the in-memory adapter: the canonical View AST has shape but no relation
membership predicate, so providers receive no nested authority constraint to execute.

## Desired Security Contract

1. Projection permission and population authority remain distinct.
2. Every materialized Entity population, root or nested, is intersected with receiver-owned scope
   before values cross the Runtime boundary.
3. Caller-authored `not`/`or`, View shape, ordering, and limits cannot weaken or relocate a
   mandatory nested scope.
4. The contract is storage-neutral and has equivalent behavior in memory and SQL providers.
5. Capability discovery and client ASTs do not disclose private policy expressions.
6. Existing policies do not silently acquire ambiguous behavior; migration is explicit if the
   relation-policy authoring shape must change.

## Design Questions

1. Should a nested Relation refer to the registered target policy by Entity identity, embed a
   reusable scoped policy node, or declare an explicit materialization policy distinct from root
   read modes/cardinalities/limits?
2. Does the Query execution IR need a receiver-only scoped Relation node, leaving the portable View
   AST caller-owned and unchanged?
3. For `hasMany` and `manyToMany`, unauthorized targets naturally filter from the collection. For
   a nullable `belongsTo`, they naturally become `null`. What is the sound result for a required
   `belongsTo`: reject the whole read, omit the source row, or model an explicit inaccessible value?
4. How do nested scope, relation-local ordering, and limits compose? Authority filtering must occur
   before limit and exact-cardinality checks.
5. Which scope expressions can every provider lower? Relation-image scopes may require correlated
   `EXISTS`; unsupported scopes must fail closed rather than fall back to post-response filtering.
6. How should observation invalidation include policy dependencies reached only through a nested
   Relation?

## Proposed Execution Slices

1. [x] Add the smallest realistic Core regression reproducing the Atlas Workspace / active
       Membership leak through a recursive View.
2. [x] Specify nested materialization authority in the Query/View execution contract, including
       required and nullable to-one semantics.
3. [x] Implement receiver authorization rewriting without adding authority predicates to the
       caller-owned portable View AST.
4. [x] Implement in-memory execution and semantic tests for to-many, nullable to-one, required
       to-one, nested hops, and fail-closed unsupported scope.
5. [x] Implement PostgreSQL lowering with authority filtering before relation-local order/limit.
6. [x] Reconcile MySQL, Supabase, and other advertised recursive-View providers; either implement
       equivalent lowering or reject the capability explicitly.
7. [ ] Add Runtime Protocol and remote React consumer coverage proving that foreign and inactive
       related records never reach the client cache.
8. [x] Update policy, View, Query, and application-data-access documentation with the distinction
       between projection permission and nested population scope.
9. [x] Add a consumer-visible `@ontahi/core` Changeset and run packed-artifact verification.
10. [ ] Validate Atlas against the candidate package, then simplify its two settings root reads
        only after the Ontahí prerelease is published and pinned exactly.

## Acceptance

- A Workspace root authorized for tenant A cannot materialize tenant B or inactive Memberships
  through any permitted recursive View path.
- A directly authorized Membership root and the same Membership materialized through a Relation
  observe the same receiver-owned population scope.
- Nested target scopes are applied at every hop and outside caller Boolean expressions.
- Filtering happens before nested ordering, limits, and cardinality decisions.
- Unsupported provider/scope combinations fail closed with a stable diagnostic and return no
  partial relation data.
- In-memory and PostgreSQL proofs cover the same semantic fixtures.
- Remote Runtime and React cache proofs show only authorized nested identities.
- Public documentation makes the former root-only behavior and migration path unambiguous.
- Atlas passes its Workspace Settings isolation regression using one composed read against the
  packed candidate or published prerelease.

## Non-Goals

- Do not add caller-authored arbitrary predicates to Views as a substitute for authority.
- Do not filter already-materialized responses after provider execution.
- Do not infer authorization from relation foreign keys or tenant naming conventions.
- Do not redesign Graph Command relationship eligibility in this slice.
- Do not collapse Atlas reads before exact-package compatibility evidence exists.

## Verification

- Focused Core regression, then affected Core suites.
- Provider integration suites for every changed recursive-View implementation.
- Runtime Protocol and remote React Graph integration tests.
- `pnpm lint`, `pnpm typecheck`, affected builds/tests, formatting, and artifact verification.
- Candidate tarball installed in Atlas with its isolation test, typecheck, and production build.

## Closure / Evolution

Implementation checkpoint: nested Relation nodes now carry receiver-owned membership in the
execution Query, with in-memory, shared PostgreSQL/MySQL, and Supabase lowering. Required to-one
targets fail closed when scope removes an existing target; nullable to-one becomes `null`, and
to-many populations filter before ordering and limits. Core Runtime Protocol dispatch proves the
scope is applied before execution. Public docs, durable items, and a package Changeset are updated.

Open. Remote React cache coverage, publication, and exact-version Atlas compatibility remain. Atlas
retains separate Workspace and Membership root reads until those final slices are complete.
