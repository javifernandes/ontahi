---
id: ontahi.model.durable-operation
kind: concept
title: Durable Operation
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.durable-workflows
  - ontahi.operation-contracts
typeOf:
  - ontahi.model.domain-operation
relatedPlans:
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - bookops://plans/75c-durable-operation-result-contracts
  - bookops://plans/75d-graph-native-durable-operation-lifecycle-contracts
  - bookops://plans/70-first-class-workflow-tier-in-architecture
migratedFrom: bookops://atlas/model/durable-operation
sourceCommit: 67713696
---

A [[ontahi.model.durable-operation|Durable Operation]] is a domain operation whose execution may span time, retries, external services, task state, or workflow orchestration.

It should keep the same domain contract discipline as a synchronous [[ontahi.model.domain-operation|Domain Operation]], while making progress, retry, failure, and replay visible.

Its reflected lifecycle contract distinguishes start input, immediate `TaskRunRef`, progress snapshots, typed step inputs and outputs, and eventual final output. A runtime `TaskDefinition` is a projection of this contract, not a second semantic source of truth. Runtime adapters validate every declared lifecycle schema before progress or results cross persistence, workflow, or step boundaries.

React consumers use `useDurableOperation` as a lifecycle hook, not merely a start mutation. After receiving the initial `TaskRunRef`, the hook follows task snapshots until `completed`, `failed`, or `cancelled`, exposing status, progress, final result, and error. Polling is the portable baseline; an environment resource may later supply push-based observation without changing the operation contract or component API.

Cache invalidation associated with a durable operation occurs when the run completes, rather than when the runtime merely accepts the start request.

Some workflow engines require a lightweight generated task artifact. That artifact must be a complete mechanical projection of the durable operation contract and must never become a separately authored model.

The current runtime reflects declared durable idempotency policies but does not yet enforce them
when starting a task. A start without an explicit `runId` receives a fresh identity, and HTTP
ingress delivery identity does not yet reach the operation invocation. Therefore
`allow-concurrent`, `reuse-running`, `skip-if-completed`, `replace-running`, and
`queue-after-current` are descriptive metadata today, not runtime guarantees. Plan 132 owns the
identity, deduplication, retry, and external-effect semantics required to make those declarations
enforceable.
