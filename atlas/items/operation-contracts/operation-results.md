---
id: ontahi.operation-contracts.operation-results
kind: capability
title: Operation Results
parent: ontahi.operation-contracts
status: active
horizon: now
supports:
  - ontahi.operation-contracts
relatedPlans:
  - bookops://plans/75-operation-result-contracts
  - bookops://plans/75b-canonical-operation-invocation-results
  - ontahi://plans/100f-operation-invocation-capability
  - bookops://plans/75c-durable-operation-result-contracts
  - bookops://plans/75d-graph-native-durable-operation-lifecycle-contracts
  - ontahi://plans/128a-ontahi-recursive-views-and-projectable-operation-results
  - ontahi://plans/128b-ontahi-projectable-operation-client-bridge
migratedFrom: bookops://atlas/operation-contracts/operation-results
sourceCommit: 67713696
---

Operation Results cover the result side of operation contracts: initial operation result shape, canonical invocation results, and durable workflow result contracts.

These plans describe one conceptual line rather than three unrelated concerns.

Synchronous semantic invocation returns one discriminated `OperationInvocationResult`: `success`, `input_invalid`, `rejected`, `failed`, or `errored`. Runtime `{ success, data }` envelopes remain available only through explicitly raw execution APIs and are not a bridge or UI contract.

An Operation whose output is explicitly `self.one()` or `self.many()` returns a projectable
Selection result. A local or generated React caller may apply `.as(view)` before execution; the
runtime combines the Operation's semantic population with the caller's recursive View into one
storage Query. Fixed and durable outputs remain non-projectable.

Durable semantic invocation returns a task-run reference immediately. Progress and final output remain distinct reflected contracts observed through that run.

Progress, step outputs, and final output are graph-native result contracts preserved through task projection, code generation, runtime validation, and Explorer reflection. A reflected durable contract is incomplete when any generated registry or runtime can see only its TypeScript return types.
