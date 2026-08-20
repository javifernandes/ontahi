# 137a. Read-Only Relation Explorer

Status: done

Canonical ID: `ontahi://plans/137a-read-only-relation-explorer`

Parent plan: [137. Reflected Relation Affordances](../current/137-reflected-relation-affordances.md)

## Summary

Raise the current Explorer from raw Entity tables to a semantic, navigable, strictly read-only
Relation browser. Reflect static topology once, present Reference Fields as portable Entity
identity, and materialize related attributes only through caller-authored Queries executed by the
existing graph runtime and graph-read policy.

This child deliberately removes the dependency on Plan 136 from the first usable Explorer slice.
Eligibility, authorization decisions, mutation controls, and optimistic reconciliation remain in
the parent plan and its dependencies.

## Research / Evidence

1. `ExplorerEntityDetail.relations` currently exposes only `name`, a loose `kind`, and target name.
2. Core already owns `RelationDefinition`, Reference Field nullability, canonical forward/inverse
   normalization, cardinality-specific structural verbs, Entity locators, and display metadata.
3. reflected Entity data currently renders provider rows as generic scalar cells; PostgreSQL and
   Supabase may therefore expose the storage scalar behind a Reference Field.
4. Explorer already links Entity definitions and receives a host-provided graph client, but its
   reflected data endpoint is separate from graph-read policy. Relation materialization must not
   silently reuse that endpoint as an authorization bypass.
5. Queries, Views, relation-root traversal, runtime binding, and default-deny graph-read policies
   already exist. Explorer should consume an injected related-data Query capability rather than
   reproduce their semantics.
6. Ontahi has no explicit Association Entity role metadata today. Required Ref fields, locators,
   and identity are evidence only, so the honest reflected classification is `unknown`.

## Scope

1. Reflect Relation name and canonical identity, target Entity, cardinality, required/nullability,
   forward/inverse direction, direct `belongsTo`/`hasMany`/`manyToMany` kind, and structural verbs
   as read-only metadata.
2. Describe Reference Field columns with their target Entity and portable locator identity.
3. Render received Refs as semantic links using locator/display identity when available; never
   present their storage scalar as the primary UI.
4. Add a read-only related-instances panel for `hasMany` and `manyToMany` Relations.
5. Require related-instance loading to enter Explorer through an injected Query-backed reader;
   Explorer neither constructs provider queries nor evaluates authorization.
6. Reflect explicit Association Entity role metadata when present and otherwise return `unknown`.

## Non-Goals

1. No `assign`, `clear`, `add`, or `remove` controls or execution.
2. No generic remote Entity Command design.
3. No arbitrary callbacks on Relation.
4. No eligibility or policy evaluator in Explorer.
5. No direct provider access or duplicated Query/authorization logic for related instances.
6. No inference that required Reference Fields imply an Association Entity.
7. No headless mutation picker or optimistic outcome reconciliation.

## Proposed Form

```ts
type ReflectedRelationDescriptor = {
  name: string;
  kind: 'belongsTo' | 'hasMany' | 'manyToMany';
  direction: 'forward' | 'inverse';
  cardinality: 'one' | 'many';
  targetEntityName: string;
  nullable: boolean;
  required: boolean;
  structuralVerbs: readonly ('assign' | 'clear' | 'add' | 'remove')[];
};

type ReflectedRelatedEntityDataReader = {
  readRelatedEntityData(request): Promise<ReflectedEntityDataResult>;
};
```

The reader is a capability boundary, not authority metadata. A host implements it by executing a
Relation-root Query through its configured runtime. If the graph-read policy denies that Query, the
panel shows the returned failure; Explorer never falls back to reflected table access.

## Execution Slices

1. Add failing semantic tests for Relation descriptors, portable Ref columns, and unknown versus
   explicit Association Entity classification.
2. Implement the smallest Core/reflection contract without React dependencies.
3. Add failing Explorer component tests for Ref navigation and related-instance presentation.
4. Implement read-only UI plus the injected Query-backed related-data boundary.
5. Verify a `hasMany` and a `manyToMany` case consume the same relation metadata and reader
   contract.
6. Add Changesets for changed public Core, React, and Explorer surfaces.
7. Update the Relation Atlas item and this plan with the landed evidence.

## Acceptance Checklist

- [x] Entity detail reflects semantic Relation topology and read-only structural verbs.
- [x] Reference Fields render as portable semantic Ref links instead of raw ids.
- [x] Ref labels prefer received display identity and otherwise use locator identity.
- [x] `hasMany` and `manyToMany` related instances can be listed and navigated.
- [x] Related attributes are loaded only through an injected Query-backed, policy-enforced reader.
- [x] Explorer contains no provider query or authorization logic.
- [x] Association Entity classification is explicit or `unknown`; ordinary required-Ref Entities
      are not inferred as associations.
- [x] Core remains independent of React.
- [x] Focused tests, affected package tests, typecheck, lint, and format checks pass.
- [x] Public surface changes have Changesets and the Relation Atlas item records the durable shape.

## Verification

1. Core semantic contract tests for forward, inverse, nullable, required, and many-to-many cases.
2. Compile-time coverage for the public reflected contracts where inference matters.
3. Explorer Testing Library assertions over links, accessible relation summaries, and related rows;
   no snapshots or incidental prose-only assertions.
4. Focused Core, React, and Explorer suites, followed by package typecheck, lint, and format checks.

## Decisions

1. Static Relation metadata and authority-dependent runtime affordances are separate contracts.
2. A Ref already received is portable identity and may be rendered without another read.
3. Related attributes require an authorized Query and never an Explorer-side provider shortcut.
4. Association Entity remains an ordinary Entity and defaults to classification `unknown` until
   explicit metadata exists.
5. Schema reflection derives read-only inverse endpoints from declared Relations. Derived endpoints
   retain the canonical declared Relation identity and do not invent a domain member name or
   executable structural affordance.

## Open Questions

1. Should explicit Association Entity role authoring land in Plan 137 or a smaller model plan?
2. Should the Query-backed related reader remain a host capability or become a conventional adapter
   over runtime-bound generated Entity APIs after the first proof?

## Closure / Evolution

## Closure

- Status: done
- Closed on: 2026-08-20
- Effective effort: ~2h focused work
- Landed shape:
  - semantic Entity/Relation descriptors include portable identity, direction, cardinality,
    nullability, target identity/display, canonical identity, and structural verbs;
  - Data renders Reference Fields as locator-aware Entity links and applies incoming locator links
    as an Entity data filter;
  - `hasMany` and `manyToMany` panels consume one injected related-data Query capability;
  - explicit graph-relation owners reflect as associations while ordinary Entities remain
    `unknown`.
  - schema reflection exposes undeclared inverse endpoints as `derived-inverse` topology; Explorer
    counts and presents them without treating them as executable Relation roots.
- Verification: Core and Explorer package suites, focused React tests, affected package typechecks,
  lint, and format checks.
- Deferred: authority decisions, eligibility explanations, mutation controls, optimistic outcome
  reconciliation, and explicit ordinary-Entity association-role authoring remain in Plan 137 and
  its dependencies.
