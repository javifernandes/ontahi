# 128b. Ontahi Projectable Operation Client Bridge

Status: done

Canonical ID: `ontahi://plans/128b-projectable-operation-client-bridge`

Migrated from: `bookops://plans/128b-projectable-operation-client-bridge`
Original path: `plans/done/128b-ontahi-projectable-operation-client-bridge.md`
Source commit: `67713696`

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

## Summary

Carry a caller-authored recursive View through Ontahi's existing Operation invocation bridge so a
React client can request the materialized shape of a Selection-shaped Operation result.

```ts
const trips = await Trip.available(input).as(TripList).run();
```

The Operation still defines the semantic population, the caller defines the result shape, and the
server composes both into one final Query before storage execution.

## Context

Plan 128a proved this composition in the local Core runtime. React can already execute ordinary
Queries shaped with `.as(view)` through a configured graph executor, but the Operation bridge only
transports `operationId` and `input`. Generated/reflected clients therefore cannot yet carry the
View required by a projectable `self.one()` or `self.many()` output.

## Scope

1. Extend Operation invocation with an optional versioned, JSON-safe View AST.
2. Rebuild and validate that View against the Operation's declared Selection output Entity.
3. Invoke the projectable server path so the Operation Selection and caller View produce one Query.
4. Expose a typed projectable call through generated/reflected client Entities and React hooks.
5. Prove the complete behavior through the transport-neutral dispatcher and fetch bridge.

## Non-Goals

1. Do not implement the generic remote Query/Command protocol from plan 128.
2. Do not add graph read policy or authorization semantics beyond existing Operation authority.
3. Do not make fixed, value, array, or durable Operation outputs projectable.
4. Do not migrate the Trips application in this slice.
5. Do not add relationship mutation semantics from plan 131.

## Execution Slices

### Slice 1: Protocol And Server Composition

- [x] Parse an optional canonical View AST on invocation requests.
- [x] Reject malformed, mismatched, or non-projectable projections with structured results.
- [x] Rehydrate the View from registered server Entity/Relation definitions.
- [x] Execute the existing projected Operation runner with declared cardinality.

### Slice 2: Client And React Surface

- [x] Preserve projectable output metadata in client reflection/code generation.
- [x] Add a typed client call carrying `.as(view)` without duplicating Query/View concepts.
- [x] Route the projection through fetch and framework bridge adapters.
- [x] Integrate projected output with React Query cache identity and normalization.

### Slice 3: End-To-End Proof And Documentation

- [x] Prove a recursive Trip View over a bridged projectable Operation.
- [x] Assert the server performs one final storage Query.
- [x] Document direct graph reads versus bridged projectable Operations for React callers.

## Verification

- [x] Protocol round-trip tests cover invocation with and without a View.
- [x] Server tests cover entity mismatch, unsupported output, malformed metadata, and cardinality.
- [x] React/fetch tests cover request payload, query key identity, result typing, and cache behavior.
- [x] Core and React unit tests, typecheck, lint, and build pass.
- [x] Public package changes include a Changeset.

## Implementation Checkpoint

The first implementation pass adds the optional View to the transport-neutral Operation request,
rebuilds it from server Entity definitions, dispatches through `invokeProjected`, and exposes typed
`.as(view)` on generated client Operation declarations. Next Action and fetch adapters transport the
same AST, and React Query includes it in cache identity. A recursive Trip invocation now crosses the
real dispatcher and performs one final storage read. Core has 386 passing tests and React has 46;
both packages pass typecheck and lint, and all packages build.

## Decisions

1. The bridge transports the canonical View AST, not executable authoring callbacks.
2. Projection remains part of Operation invocation because the named Operation still owns the
   semantic population; this slice does not substitute the generic graph-read protocol.
3. The server is authoritative for rebuilding and validating the View.
4. Existing unprojected Operation calls remain backward compatible.

## Open Questions

1. React consumes the projected generated Operation value directly:
   `useOperationQuery(Trip.domain.available.as(TripList), input)`.
2. Malformed or incompatible projections are semantic rejected invocation results with reason
   `invalid_projection`; malformed transport envelopes remain protocol errors.

## Acceptance Checklist

- [x] A React caller can execute a bridged Selection-shaped Operation with a recursive View.
- [x] The wire request is JSON-safe and contains no executable functions.
- [x] Only explicit `self.one()` and `self.many()` outputs accept projections.
- [x] The runtime executes one composed Query after the Operation returns its Selection.
- [x] Existing Operation invocation behavior remains compatible.

## Closure

- Status: done
- Landed in: Ontahí PR [#29](https://github.com/javifernandes/ontahi/pull/29)
- Documentation: Ontahí Library commit `5fd1695`
- Closed on: 2026-08-16
- Effective effort: ~2h focused work
- Follow-ups:
  - [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
  - Pilot the released API in Nahue's Trips application before freezing the generic remote Query
    protocol.
