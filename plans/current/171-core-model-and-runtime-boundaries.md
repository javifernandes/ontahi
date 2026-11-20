# 171. Core Model And Runtime Boundaries

Status: current

Canonical ID: `ontahi://plans/171-core-model-and-runtime-boundaries`

Related plans:

1. [169. Replicated Versioned Models Kernel And Materializer SPI](../current/169-replicated-versioned-models-kernel-and-materializer-spi.md)
2. [160. Semantic Modules, Composition And System Boundaries](../research/160-semantic-modules-composition-and-system-boundaries.md)

## Summary

Reorganize `@ontahi/core` around explicit conceptual boundaries between values, application models,
computation, and runtime implementation. Replace `data-graph` as an oversized historical namespace
with smaller model and runtime modules while preserving the public package API throughout the
migration.

The work begins by describing ownership and allowed dependencies, not by performing a repository-wide
rename. Mechanical moves follow only after each group has a clear destination and compatibility
surface.

## Context

`data-graph` began as a useful description of Ontahí's graph-oriented entity model. It now contains
Entity and Field definitions, references, relations, selections, operations, reactions, protocols,
dispatchers, planning, client cache behavior, remote execution, and an in-memory storage/runtime.
The name no longer communicates which concepts are portable model semantics and which are concrete
execution mechanisms.

The imbalance is visible elsewhere: `model/` contains only small validation helpers while the
identity-bearing domain model lives mostly under `data-graph`; `runtime/` already owns substantial
client/server execution; and `data-graph/client/cache/index.ts` combines several independent cache
responsibilities in one large module. Adding Replicated Versioned Models at the source root made the
missing model boundary more obvious.

## Architectural Lens

Use four peer concepts unless implementation evidence proves a better hierarchy:

1. `value`: data and constraints without identity;
2. `model`: identity-bearing application concepts and their portable semantics;
3. `computation`: reusable ways to produce, combine, and transform values;
4. `runtime`: engines, protocols, caches, storage adapters, and environment-specific execution.

`model` is not a replacement catch-all for Core. A module belongs there only when its meaning is
independent of a particular client, server, transport, storage engine, or execution strategy.

An indicative shape is:

```text
src/
  value/
  computation/
  model/
    entity/
    operation/
    query/
    expression/
    replication/
  runtime/
    client/
    server/
    protocol/
    storage/
      in-memory/
```

The exact directories are outputs of classification, not precommitted destinations.

## Scope

- Inventory `data-graph` and classify modules as portable model, runtime, adapter, compatibility
  facade, or unresolved.
- State allowed dependency directions and identify current cycles or inversions.
- Establish narrow model boundaries for Entity identity, fields, references, relations,
  invariants/preconditions, operations, selections/views, expressions, and replication.
- Move concrete in-memory behavior behind a runtime/storage adapter boundary.
- Split the graph client cache by responsibility without changing its observable behavior.
- Determine whether the legacy Zod helpers remain a supported public compatibility surface,
  should move to value validation, or should be deprecated in favor of Ontahí schemas.
- Preserve package-root exports and add compatibility re-exports when internal paths move.
- Retire the `data-graph` directory only after no concept depends on it as an architectural bucket.

## Non-Goals

- A single large rename or file-move PR.
- Redesigning Entity, operation, query, cache, or storage semantics during mechanical extraction.
- Treating every type as a model or nesting `value` and `computation` under `model` without evidence.
- Breaking package-root imports or promising compatibility for undocumented internal paths.
- Creating new packages before the in-package boundaries demonstrate that they are independently
  useful.

## Execution Slices

1. [Completed: module inventory, dependency map, classification rubric, and target boundary
   proposal](../../docs/architecture/core-model-and-runtime-boundaries.md).
2. Extract the portable Entity kernel from `data-graph/definitions.ts` into cohesive model modules,
   retaining compatibility exports and behavior-level tests.
3. Separate portable operation, query/selection, relation, and expression semantics from their
   dispatch and execution machinery.
4. Move in-memory storage/runtime implementation under a concrete runtime adapter boundary.
5. Split client cache records/events, normalization, entity storage, output storage, and
   reconciliation into internal modules behind its current public factory.
6. Audit `model/zod.ts` usage and either document, relocate, deprecate, or remove it through the
   package's normal compatibility process.
7. Migrate remaining consumers, measure dependency direction, and remove the obsolete
   `data-graph` compatibility directory only when safe.

Each slice should be its own PR unless a preceding analysis proves two adjacent slices are purely
mechanical and low risk.

## Acceptance Checklist

- [ ] Every existing `data-graph` module has a recorded owner category and intended destination.
- [ ] Model modules do not depend on client, server, transport, or concrete storage implementations.
- [ ] Runtime modules consume portable models through explicit contracts.
- [ ] The in-memory implementation is recognizable as a storage/runtime adapter rather than model
      semantics.
- [ ] Client cache responsibilities are split into reviewable modules without changing behavior.
- [ ] The legacy Zod surface has an evidence-backed disposition and migration path.
- [ ] Package-root consumers retain source compatibility through the migration.
- [ ] Public API changes carry Changesets; mechanical internal moves do not manufacture API churn.
- [ ] `data-graph` no longer serves as the default destination for unrelated Entity-adjacent work.

## Verification

- Add architecture tests or static dependency checks for accepted direction rules where they
  provide durable value.
- Run focused tests for every moved subsystem and the full `@ontahi/core` suite for each behavioral
  extraction.
- Run typecheck, lint, build, Changeset status when applicable, artifact verification for public
  package changes, and `git diff --check`.
- Use representative server, React/client, and adapter consumers to verify package-root compatibility.

## Decisions

1. `value`, `model`, `computation`, and `runtime` begin as peer concepts.
2. Identity-bearing semantics belong to the model layer; persistence and execution do not.
3. `data-graph` is a migration source and compatibility concern, not the proposed destination name.
4. Public API stability is independent from internal file organization.
5. Classification and dependency rules precede broad file movement.

## Open Questions

1. Is `entity` the root portable model abstraction, or does a smaller schema/value-object layer sit
   between `value` and Entity?
2. Which operation concepts are model declarations versus runtime invocation and dispatch?
3. Are selections and views part of the Entity model, a query model, or a distinct semantic-program
   boundary?
4. Should the in-memory implementation remain in Core, become a test/reference adapter, or later
   move to its own package?
5. Which client cache records are generic Entity-model concepts and which are graph-read-specific?
6. Does the current Ontahí schema fully replace the exported Zod helpers for supported use cases?

## Closure / Evolution

Slice 1 is complete. The inventory classifies all 87 non-test modules under `data-graph`, records
the current model/runtime inversions, adopts allowed dependency directions, and proposes target
boundaries. The next implementation slice is the compatibility-preserving extraction of the
portable Entity kernel from `definitions.ts`; no broad directory move is implied.

Slice 2 has started with the dependency-free Entity reference value kernel. Its implementation and
behavior tests now live under `model/entity/ref`, while `data-graph/ref/model.ts` remains as a tested
compatibility facade. Entity display and freshness metadata now live under `model/entity` as well,
alongside portable Field contracts and Entity record/mutation inference, while their established
exports remain available through `data-graph/definitions.ts`. The portable expression program now
lives under `model/expression`, preventing derived Field metadata from depending back on the legacy
namespace. Later steps preserve the same rule: no model module may depend back on the compatibility
facade.

Structural Entity identity and portable Relation contracts now cross that boundary as well.
`AnyEntityDefinition` lives under `model/entity`; Relation definitions, mappings, constraints, and
JSON-safety validation live under `model/relation`. Their recursive relationship is type-only, and
the established `data-graph/definitions.ts` exports remain compatible.

Entity locator declarations, inferred factories, and normalization now live under `model/entity`,
which also lets selected identity lookup and identity Ref materialization live under
`model/entity/ref`. Historical locator type exports and `data-graph/ref/identity.ts` remain
compatible. This cleared the identity dependency needed by Reference Fields and schema references.

Reference Field declarations and their guard now live under `model/entity`, and portable variant
descriptor/type contracts are separated from variant query execution. Schema reference
declarations, resolver attachment, and input validation therefore also live under
`model/entity/ref`. Their `data-graph` paths remain tested compatibility facades; storage lowering
in `data-graph/reference-field.ts` is deliberately deferred to the computation boundary.

Physical Entity and Relation mapping has moved out of `definitions.ts` into
`computation/entity-mapping.ts`. The established mapping exports remain identical, while the new
owner makes table/column projection and relation-field resolution explicitly computational rather
than portable Entity semantics. Entity view composition is the next dependency seam before moving
the remaining `entity(...)` builder.

Selection AST semantics and recursive Entity View construction now live under `model/query`.
`data-graph/view.ts` is reduced to a compatibility export plus the Graph-schema View overload; that
overload remains intentionally in place until portable value-schema declarations leave
`definitions.ts`. The `entity(...)` builder now consumes recursive View behavior directly from the
model boundary.

Value-schema extraction has started with the dependency-free kernel: `GraphSchemaLike`, literal and
void schemas, presentation metadata, and description/presentation authoring now live under
`value/schema`. The composite Graph schema union remains at the compatibility boundary because it
also includes Entity, View, Selection, and Reference forms; it must be decomposed rather than moved
whole into `value`.

Portable schema containers (array, nullable, optional, union, record, default, transform,
refinement, and named) now have dependency-free definitions and constructors in `value/schema`.
Compatibility interfaces in `data-graph/definitions.ts` supply the model-aware inferred value type,
so references wrapped by these containers retain their established static shape while dependency
direction remains `data-graph -> value`.

Named value and object schema shapes now follow the same split: portable representations and
constructors live in `value/schema`, while the historical `ValueDefinition` and
`GraphObjectDefinition` interfaces add composite field inference in `data-graph`. Pick derivation
metadata moved with the portable representation; the pick builder remains at the composition
boundary because its sources include Entities and Entity Views.

Field picking now follows that same split. `value/schema` owns field selection, validation,
derivation metadata, and portable named-value construction. The historical `graphSchema.pick`
builder remains at the composition boundary only to inject model-aware inferred value types for
Entity and View sources.

Lazy schema representation and construction also live in `value/schema`; the compatibility type
continues to bind its resolver to the composite Graph schema union. Selection schemas and that
composite union remain model-aware composition concerns rather than value-layer concepts.

Field authoring now lives beside the portable Field contracts under `model/entity`. Scalar,
reference, derived, nullable, optional, defaulted, and generated factories share one model-owned
surface; `data-graph/definitions.ts` only re-exports the historical `field` binding. This removes
the Field dependency seam before extracting the complete Entity builder.
