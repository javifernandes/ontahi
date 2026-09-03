# 128a. Ontahi Recursive Views And Projectable Operation Results

Status: done

Canonical ID: `ontahi://plans/128a-recursive-views-and-projectable-operation-results`

Migrated from: `bookops://plans/128a-recursive-views-and-projectable-operation-results`
Original path: `plans/done/128a-ontahi-recursive-views-and-projectable-operation-results.md`
Source commit: `67713696`

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Related plans:

1. [125. Ontahi Reference Fields](./125-ontahi-reference-fields.md)
2. [131. Ontahi Relationship Semantics](./131-ontahi-relationship-semantics.md)
3. [116. Ontahi Selection Model](../done/116-ontahi-selection-model.md)

## Summary

Define a recursive, reflectable View as the caller-authored materialization shape for an Ontahi
Entity graph, then let an Operation return a semantic Entity Selection that the caller can
materialize through that View.

The first proof is deliberately transport-free:

```ts
const trips = await Trip.available({ trips: candidateTrips }).as(TripList).run();
```

The Operation contributes the semantic population. The caller contributes the shape. The bound
runtime combines them into one final Query plan and executes it once. React, code generation, HTTP,
remote graph policy, and PostgreSQL distribution follow only after this core composition is proven.

## Context

Reference Fields correctly remain Refs in ordinary Entity snapshots. Materializing every reachable
relationship automatically would be unbounded, cyclic, expensive, and unsafe. A caller nevertheless
needs a concise way to request an exact, recursively nested graph shape without manually coordinating
`include`, nested `select`, operation output schemas, and transport-specific resolver code.

Ontahi already has most lower-level ingredients:

1. Query `select` and `include` support nested relation builders.
2. Reference Fields distinguish a Ref value from an included target snapshot.
3. Selections are portable semantic populations and may be Operation inputs or outputs.
4. Entity views and named graph reads exist, but the two current `view` concepts do not yet form one
   reusable caller-authored materialization abstraction.
5. Plan 128 already requires projection and includes in its canonical remote read program.

The remote protocol should serialize a settled semantic model. It should not be the place where
recursive result shaping or projectable Operation semantics are first discovered.

## Research / Evidence

GraphQL demonstrates the user value of recursively nested caller-authored selection sets, but Ontahi
needs the underlying shape as a reusable typed value and AST that can be authored from Node, a browser,
an Operation client, Explorer, or a future textual language.

Current Ontahi evidence:

1. `packages/core/src/data-graph/query.ts` already represents nested relation selection recursively.
2. In-memory, PostgreSQL, and Supabase conformance tests already cover nested includes.
3. `self.many()` already denotes a semantic Selection schema, while `self.array()` denotes
   materialized Entity snapshots. That distinction can remain meaningful rather than being erased.
4. Runtime-bound Selections already preserve execution capability while keeping a portable AST.

## Scope

1. Define one finite, recursive View AST for Entity fields and Relation traversal.
2. Make Views reflectable, serializable, versionable, composable, and type-inferred.
3. Add `.as(view)` to the local Query/Selection execution path.
4. Preserve the distinction between returning a Ref and traversing/materializing its Relation.
5. Let a projectable Operation output (`self.one()` or `self.many()`) produce a lazy Operation call
   that accepts `.as(view)` before `.run()`.
6. Compose the Operation-produced Selection and caller-authored View into one final storage Query.
7. Prove the behavior with focused Core tests using a non-trivial Trip domain.

## Non-Goals

1. Do not define a textual GraphQL-like Ontahi language in this slice.
2. Do not implement React hooks, generated browser clients, HTTP, or remote execution.
3. Do not implement graph authorization or relationship policies; plans 78 and 128 own those later
   boundaries.
4. Do not implement Relationship Commands such as assign, add, remove, or clear.
5. Do not migrate BookOps or require a complete Todo application.
6. Do not implement GraphQL fragments, directives, unions, subscriptions, or resolver semantics.
7. Do not bridge remote Commands.

## Proposed Form

The illustrative authoring shape is intentionally close to a recursive object selection. The exact
surface may change after the type and AST tests:

```ts
const CompanySummary = Company.pick('id', 'name');

const TripList = Trip.view('TripList', {
  id: true,
  from: true,
  to: true,
  truck: {
    id: true,
    brand: true,
    model: true,
    owner: {
      id: true,
      name: true,
      company: CompanySummary,
    },
  },
  driver: {
    id: true,
    name: true,
  },
  stops: {
    id: true,
    order: true,
    place: {
      name: true,
      country: {
        code: true,
      },
    },
  },
});
```

A Reference Field selected as a leaf remains a Ref:

```ts
const TripRefs = Trip.view('TripRefs', {
  id: true,
  driver: true,
});
```

A nested object traverses and materializes the canonical Relation:

```ts
const DriverName = Trip.view('TripDriverName', {
  id: true,
  driver: { name: true },
});
```

Every Relation node in the canonical AST preserves at least:

```ts
type RelationViewNode = {
  kind: 'relation-view';
  relation: string;
  direction: 'forward' | 'inverse';
  targetEntity: string;
  cardinality: 'one' | 'many';
  nullable: boolean;
  view: ViewNode;
};
```

The AST is finite even when the Entity graph is cyclic. Future nested filters, ordering, pagination,
and policy metadata must extend Relation nodes without changing their identity.

The first projectable Operation proof uses a Selection input and output without executing a read in
the Operation body:

```ts
available: operation({
  input: O.object({
    trips: self.many(),
  }),
  output: self.many(),
  run: ({ trips }) => trips.and(trip => trip.status.eq('available')),
});
```

The simulated caller remains framework-free:

```ts
const candidateTrips = Trip.where(trip => trip.region.eq('south'));

const trips = await Trip.available({ trips: candidateTrips }).as(TripList).run();
```

The runtime should execute the Operation to obtain the final semantic Selection, apply `TripList`,
compile one Query plan, and perform one storage read.

Projectability is explicit:

1. `output: self.many()` or `self.one()` may accept `.as(TripView)`.
2. `output: self.array()` remains an already-materialized snapshot array with a fixed shape.
3. `output: TripList.array()` remains a fixed materialized View result.
4. Arbitrary Value outputs do not gain `.as(...)` accidentally.

## Execution Slices

### Slice 1: Recursive View Contract

- [x] Reconcile the current Entity-view and named-query-view vocabulary before adding a third
      competing public concept.
- [x] Specify recursive View input types, canonical AST nodes, descriptors, and inferred result
      types.
- [x] Prove stable serialization without executable functions or provider metadata.
- [x] Preserve canonical Relation identity, direction, cardinality, and nullability at every depth.

### Slice 2: Local Materialization

- [x] Bind `.as(view)` to Query and Selection values.
- [x] Compile Views into the existing recursive Query selection/include machinery.
- [x] Execute arbitrary-depth Views through the in-memory runtime.
- [x] Assert that leaf Reference Fields remain Refs and nested Relation nodes materialize snapshots.

### Slice 3: Projectable Operation Results

- [x] Introduce a lazy typed Operation call value for Selection-shaped outputs.
- [x] Let `.as(view)` attach caller materialization before execution.
- [x] Execute the Operation body first, rebind its returned Selection, then compile one final Query.
- [x] Preserve existing eager/fixed output behavior for non-projectable Operations.

### Slice 4: Diagnostics And Extension Seams

- [x] Fail early when a View traverses an unknown, incompatible, or ambiguous Relation.
- [x] Make the final Query plan inspectable in tests and future telemetry.
- [x] Leave explicit extension seams for nested relation filters, ordering, pagination, policy, and
      remote serialization without implementing every seam now.

## Verification

- [x] A `Trip -> Truck -> Owner -> Company` View materializes correctly.
- [x] The same View also materializes `Trip -> Driver` and `Trip -> Stops[] -> Place -> Country`.
- [x] The inferred TypeScript result matches Relation cardinality and nullability at every depth.
- [x] A View round-trips through its canonical JSON-safe AST.
- [x] Cyclic Entity topology produces a finite View and never implies recursive auto-hydration.
- [x] `Trip.available({ trips }).as(TripList).run()` executes through one final storage Query plan.
- [x] No React, HTTP, generated client, PostgreSQL server, or BookOps application is required by the
      proof.
- [x] Existing Query, Selection, Ref, include/select, and fixed Operation output tests remain valid.

## Decisions

1. Caller-authored materialization is a first-class semantic value, not transport syntax.
2. Recursive depth is foundational and must not be added after a one-level View protocol ships.
3. Relations are traversed explicitly; ordinary Entity snapshots continue to carry Refs.
4. The local Core composition is proven before bridge or UI integration.
5. Relationship mutation semantics are researched separately in plan 131, while Relation identity
   is preserved now so that later policy and transition models do not require a View protocol break.

## Implementation Outcome

Ontahí implemented the plan incrementally in four merged pull requests:

1. [`#25`](https://github.com/javifernandes/ontahi/pull/25) introduced the recursive, typed,
   reflectable, JSON-safe View contract.
2. [`#26`](https://github.com/javifernandes/ontahi/pull/26) applied Views to Query and Selection
   values through the existing recursive `select` and `include` machinery.
3. [`#27`](https://github.com/javifernandes/ontahi/pull/27) introduced lazy projectable Operation
   results for explicit `self.one()` and `self.many()` outputs.
4. [`#28`](https://github.com/javifernandes/ontahi/pull/28) added canonical diagnostics, final Query
   inspection, the complete recursive Trip proof, and aligned static/runtime projectability.

The closing Core suite passed 378 tests plus typecheck, lint, and build. Ontahí Library documents
the public surface under the existing Queries and Operations chapters as “Reuse a result view” and
“Shape a Selection result”. Remote transport remains owned by plan 128.

## Open Questions

1. Should the public name be View, Projection, Shape, or a deliberate distinction between them?
2. Should the primary authoring surface be a recursive object, a typed builder, or both compiling to
   one AST?
3. How do aliases and computed Value fields compose without turning Views into executable programs?
4. How should nested `where`, ordering, limits, and pagination attach to to-many Relation nodes?
5. Can parameterized named reads be expressed as View + Selection parameters instead of retaining a
   second unrelated `view()` concept?
6. What backward-compatible call behavior should an Operation have before `.as(...)` or `.run()`?

## Closure / Evolution

This plan closes when the framework-free Trip proof composes an Operation-produced Selection with a
caller-authored recursive View into one inspectable, executable Query plan. Remote execution then
returns to the next slice of plan 128; React and code generation remain projection work over the same
core value.

## Closure

- Status: done
- Landed in: Ontahí PRs [#25](https://github.com/javifernandes/ontahi/pull/25),
  [#26](https://github.com/javifernandes/ontahi/pull/26),
  [#27](https://github.com/javifernandes/ontahi/pull/27), and
  [#28](https://github.com/javifernandes/ontahi/pull/28)
- Closed on: 2026-08-15
- Effective effort: ~3-4h focused work
- Follow-ups:
  - [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
  - [131. Ontahi Relationship Semantics](./131-ontahi-relationship-semantics.md)
