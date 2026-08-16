# 133. Nominal Model Registry And Codegen Reuse

Status: current

Canonical ID: `ontahi://plans/133-nominal-model-registry-and-codegen-reuse`

Related plans:

1. [128. Data Graph Execution Bridge](../next/128-ontahi-data-graph-execution-bridge.md)
2. [128a. Recursive Views And Projectable Operation Results](../done/128a-ontahi-recursive-views-and-projectable-operation-results.md)
3. [125. Reference Fields](./125-ontahi-reference-fields.md)

## Summary

Give every application-level Entity, View, and Value one canonical nominal identity, reject distinct
declarations that claim the same name, and let codegen project each named definition once for reuse
across generated Operations and runtime boundaries.

The first slice strengthens the analyzed application model before adding a broad public registration
surface. It inventories reachable named definitions, preserves their declaration origin, and rejects
ambiguous names with structured diagnostics.

## Context

Ontahi already treats names as semantic identity in reflection and transport:

```ts
entity({ name: 'Trip', ... })
Trip.view('TripList', { ... })
value('TripListItem', { ... })
```

Codegen currently resolves an Operation contract identifier to its initializer and writes that
initializer inline. Reusing one named Value in several Operations therefore duplicates its generated
definition. More importantly, two unrelated declarations may claim the same reflected name without
an application-level diagnostic.

The recent `TripListItem` regression also showed that schema dependencies must be understood as a
graph of named semantic definitions rather than discovered from rendered text.

## Proposed Form

The application owns one nominal namespace:

```text
Trip          -> Entity declaration
TripList      -> View declaration
TripListItem  -> Value declaration
```

Rules:

1. Reusing the same declaration from several Operations is valid and produces one registry entry.
2. Two distinct declarations with the same name are invalid, even when structurally equivalent.
3. Name collisions across Entity, View, and Value are invalid.
4. Canonical identity at the application boundary is the semantic name; source/export identity is
   retained as evidence for diagnostics and code generation.
5. Generated browser artifacts project server declarations into browser-safe definitions; they do
   not import server modules merely to preserve object identity.

The eventual generated shape may be:

```ts
const TripListItemSchema = value('TripListItem', {
  id: field.id(),
  driver: field.ref(DriverSchema),
});

export const Trip = defineClientEntity(TripSchema, {
  domainOperations: {
    available: defineClientDomainOperation({ output: TripListItemSchema }),
  },
});
```

The local generated identifier is not the canonical identity. It only avoids JavaScript binding
collisions while the reflected name remains `TripListItem`.

## Scope

1. Define a serializable named-definition entry in the analyzed application model.
2. Inventory graph Entities and named Values reachable from Operation contracts.
3. Preserve definition kind, semantic name, source path, declaration/export name, and dependencies.
4. Reject distinct declarations that claim one name, including cross-kind collisions.
5. Treat repeated references to the same declaration as one entry.
6. Extend the inventory to registered Views once the smallest application registration surface is
   settled.
7. Emit each registered/reachable Value or View once and reuse it from generated Operations.
8. Validate generated artifacts semantically and through TypeScript where public inference matters.

## Non-Goals

1. Do not introduce a runtime-global process singleton.
2. Do not deduplicate definitions by structural equality.
3. Do not import server declaration modules into browser artifacts.
4. Do not redesign Query, View, Operation, or graph-schema authoring.
5. Do not include anonymous object, array, nullable, or selection schemas in the nominal namespace.
6. Do not decide yet whether `schema.named` and named lazy schemas share this namespace.
7. Do not refactor the entire codegen analyzer in the first slice.

## Execution Slices

### Slice 1: Analyzed Nominal Inventory

- [x] Add TDD fixtures for one Value reused by two Operations, two distinct Values with one name,
      and an Entity/Value name collision.
- [x] Add a serializable named-definition inventory to application analysis.
- [x] Emit structured collision diagnostics containing both declaration origins.
- [x] Leave generated source unchanged in this slice.

Implementation checkpoint: application analysis now reports `namedDefinitions` for every graph
Entity and direct `value(...)` contract reachable from Operation input/output declarations. Exact
declaration origins deduplicate; a second origin claiming the same semantic name emits
`model-name-conflict`. View registration and reusable generated bindings remain later slices.

### Slice 2: Reusable Generated Values

- [x] Project each reachable named Value once in dependency order.
- [x] Reference the projected binding from every generated Operation contract.
- [x] Preserve browser-safe Entity dependency projection.
- [x] Execute and inspect the generated module semantically.

Implementation checkpoint: client codegen now emits one module-private binding for every reachable
named Value in the analyzed inventory. Operation inputs and outputs reuse that binding, while Entity
references inside the Value continue to target their browser-safe projected schemas. A generated
module execution test verifies both Operations observe the exact same Value object and that its
reference field targets the generated Entity schema by identity.

### Slice 3: Registered Views And Unified Namespace

- [ ] Define the smallest explicit application surface for Views not otherwise reachable from server
      Operation declarations.
- [ ] Include Entity, View, and Value in one collision policy.
- [ ] Project reusable Views without introducing a second View representation.
- [ ] Reflect the registry for Explorer and future remote Query validation.

### Slice 4: Codegen Organization

- [ ] Extract named-definition discovery and validation from `metadata-analyzer.mjs` into a focused
      module after behavior is covered.
- [ ] Separate analyzed-model construction from source rendering.
- [ ] Add coverage thresholds gradually around the extracted responsibilities.

## Verification

- [ ] Reusing one declaration produces one canonical registry entry and one generated definition.
- [ ] Separate declarations with one name fail even when their fields match.
- [ ] Cross-kind collisions fail with both origins and kinds in the diagnostic.
- [ ] The inventory survives JSON serialization without executable functions.
- [x] Generated modules execute against the real Core runtime and preserve dependency identity.
- [ ] Public types preserve the inferred result of reused Values and Views.
- [ ] Existing inline contracts and generated client behavior remain compatible.

## Decisions

1. The registry is application-scoped, not process-global.
2. Nominal equality is not structural equality.
3. Declaration origin supports diagnostics and generation but does not replace the semantic name.
4. Entity, View, and Value share one application namespace unless the first implementation produces
   concrete evidence that the collision rule is too restrictive.
5. Analysis learns identity before rendering attempts reuse.

## Open Questions

1. How are standalone Views and Values registered when they are not reachable from an Operation?
2. Should `schema.named` and named lazy schemas join the same namespace or remain schema-local labels?
3. Are generated definitions exported for application reuse or kept module-private?
4. Does runtime application reflection expose one ordered registry or kind-specific indexed views?
5. How should incremental/dynamic `registerEntity` interact with a frozen reflected registry?

## Completion Signal

This plan closes when an Ontahi application rejects ambiguous Entity/View/Value names and generated
browser clients define each reusable named contract once while preserving runtime identity, inferred
types, and server/browser boundaries.
