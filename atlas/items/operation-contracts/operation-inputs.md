---
id: ontahi.operation-contracts.operation-inputs
kind: capability
title: Operation Inputs
parent: ontahi.operation-contracts
status: active
horizon: now
supports:
  - ontahi.operation-contracts
relatedPlans:
  - ontahi://plans/76a-operation-input-constraints-and-client-validation
  - ontahi://plans/74b-schema-native-operation-refs
  - ontahi://plans/142d-existing-operation-refs
migratedFrom: bookops://atlas/operation-contracts/operation-inputs
sourceCommit: 67713696
---

Operation Inputs cover the input side of operation contracts: constraints, client validation,
reflected metadata, runtime hydration, and the UI affordances needed to safely invoke operations.

The Graph Schema input tree is the single authored contract. A top-level `field.ref(Entity)` node
accepts one portable Entity Ref and is reflected with its target Entity, identity, and declared
locators. Domain Operation declarations do not repeat that information in `inputRefs`, and bridge
inputs do not lower it into ad hoc scalar fields such as `studentId`.

On the server, the Operation implementation sees the Ref at the same field path with explicit
`resolve()`, `invalidate()`, and `refresh()` methods backed by the current UnitOfWork. Optional and
nullable wrappers preserve `undefined` and `null`. The first slice intentionally hydrates only
top-level Ref fields; nested objects, arrays, and automatic mutation invalidation require separate
evidence and plans.

`graphSchema.existingRef(Entity)` adds an existence resolution requirement to that same node. The
public input stays one portable Ref, while the immediate server Operation body receives the
authorized Entity record and its original non-enumerable `.ref` identity. Missing participants or
participants hidden by graph policy fail conventionally as `entity_not_found` before the body. Materialization
reuses the active UnitOfWork and occurs inside an atomic Operation's transaction boundary.

Existing participants currently support only direct object or Value input fields, with optional
and nullable wrappers. Nested/array positions and durable Operations fail at declaration because
their resolution lifecycles are not yet defined.

Explorer derives its semantic Ref controls from this schema node. The transported Explorer
`inputRefs` collection is a calculated presentation descriptor, not another authored model.
It distinguishes an ordinary Ref from `Existing<Entity>` without transporting current Entity data.
