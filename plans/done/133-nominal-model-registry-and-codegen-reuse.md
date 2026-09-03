# 133. Nominal Model Registry And Codegen Reuse

Status: done

Canonical ID: `ontahi://plans/133-nominal-model-registry-and-codegen-reuse`

Related plans:

1. [128. Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
2. [128a. Recursive Views And Projectable Operation Results](../done/128a-ontahi-recursive-views-and-projectable-operation-results.md)
3. [128b. Projectable Operation Client Bridge](../done/128b-ontahi-projectable-operation-client-bridge.md)
4. [134. Codegen Analysis Organization And Semantic Coverage](../current/134-codegen-analysis-organization-and-semantic-coverage.md)

## Summary

Give every server application Entity and named Value one canonical nominal identity, reject distinct
declarations that claim the same name, and let codegen project each reachable named contract once
for reuse across generated Operations and runtime boundaries.

Views deliberately remain outside this registry. They are caller-owned Query documents analogous
to GraphQL selection sets: the server Operation defines a Selection population, the client defines
a View, and the bridge carries its JSON-safe AST for validation and final Query composition.

## Server Model Registry

The server application owns one nominal contract namespace:

```text
Trip          -> Entity declaration
TripListItem  -> Value declaration
```

Rules:

1. Reusing the same declaration from several Operations is valid and produces one registry entry.
2. Two distinct declarations with the same name are invalid, even when structurally equivalent.
3. Entity/Value name collisions are invalid.
4. Declaration origin supports diagnostics and codegen; semantic name remains canonical identity.
5. Generated browser artifacts project server declarations rather than importing server modules.

Codegen emits each reachable named Value once and reuses the binding:

```ts
const TripListItemValue = value('TripListItem', {
  id: field.id(),
  driver: field.ref(DriverSchema),
});

export const Trip = defineClientEntity(TripSchema, {
  domainOperations: {
    available: defineClientDomainOperation({ output: TripListItemValue }),
  },
});
```

## Caller-Owned View Boundary

The final client shape is:

```ts
const TripList = Trip.view('TripList', {
  id: true,
  driver: { name: true },
});

Trip.domain.available.as(TripList);
```

The generated `Trip` facade delegates `.view(name, shape)` to its browser-safe Entity definition.
The View remains client source. `.as(view)` sends its versioned AST, and the server rebuilds it
against the Selection output Entity before executing one composed Query.

Consequences:

1. View names are document identity for reflection, transport, and cache identity.
2. Different clients may define Views with the same name.
3. Views do not collide with Entity or Value names.
4. A future persisted/approved View catalog would be an optional client or deployment artifact, not
   part of the server graph schema.

## Delivered Slices

### Slice 1: Analyzed Nominal Inventory

- [x] Inventory graph Entities and named Values reachable from Operation contracts.
- [x] Preserve kind, semantic name, declaration origin, and browser-safe schema text.
- [x] Deduplicate repeated references to one declaration.
- [x] Report structured same-kind and Entity/Value collision diagnostics.

### Slice 2: Reusable Generated Values

- [x] Emit each reachable named Value once.
- [x] Reuse the exact binding from every generated Operation input/output.
- [x] Preserve browser-safe Entity dependency identity.
- [x] Execute generated modules semantically against the real Core runtime.

### Slice 3: Caller-Owned Views

- [x] Reject a server-side View registry after testing the design in closed PR #38.
- [x] Preserve the AST bridge and authoritative server validation from Plans 128a/128b.
- [x] Expose recursive `.view(name, shape)` on client Entity facades.
- [x] Keep View naming outside the server Entity/Value namespace.

## Non-Goals

1. Do not introduce a runtime-global singleton.
2. Do not deduplicate definitions by structural equality.
3. Do not include anonymous schemas in the nominal namespace.
4. Do not register caller-owned Views in the server graph schema.
5. Do not decide whether `schema.named` and named lazy schemas share the Entity/Value namespace.
6. Do not combine codegen reorganization with this behavior change; Plan 134 owns that work.

## Verification

- [x] Reusing one declaration produces one registry entry and one generated definition.
- [x] Separate declarations with one name fail even when structurally equal.
- [x] Entity/Value collisions report both origins and kinds.
- [x] The analyzed inventory survives JSON serialization.
- [x] Generated modules preserve runtime dependency identity.
- [x] Client-authored Views preserve inferred projection result types.
- [x] Existing inline Operation contracts remain compatible.

## Closure

- Status: done
- Nominal registry landed in: Ontahi PR #37
- Abandoned server View registry: Ontahi PR #38, closed without merge
- Caller-owned View ergonomic correction: Ontahi PR #39
- Follow-ups:
  - [128. Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
  - [134. Codegen Analysis Organization And Semantic Coverage](../current/134-codegen-analysis-organization-and-semantic-coverage.md)
