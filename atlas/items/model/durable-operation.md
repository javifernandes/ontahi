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
  - ontahi://plans/168-atlas-semantic-item-type-reconciliation
  - atlas://plans/146-package-manifest-and-classroom-model
  - ontahi://plans/167-durable-task-subject-discovery-and-lifecycle-reactions
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - ontahi://plans/146d-versioned-durable-operation-observation-protocol
  - ontahi://plans/146e-runtime-transport-durable-observation
  - ontahi://plans/146h-websocket-runtime-transport-and-durable-progress
  - ontahi://plans/154f-wait-and-continuation-semantics
  - ontahi://plans/146j-first-class-events-runtime-protocol-gate
  - ontahi://plans/153f-queue-backed-task-runtime
  - ontahi://plans/153g-durable-runtime-follow-ups
  - ontahi://plans/155a-vercel-workflow-event-waits
  - bookops://plans/75c-durable-operation-result-contracts
  - bookops://plans/75d-graph-native-durable-operation-lifecycle-contracts
  - bookops://plans/70-first-class-workflow-tier-in-architecture
migratedFrom: bookops://atlas/model/durable-operation
sourceCommit: 67713696
---

A [[ontahi.model.durable-operation|Durable Operation]] is a domain operation whose execution may span time, retries, external services, task state, or workflow orchestration.

It should keep the same domain contract discipline as a synchronous [[ontahi.model.domain-operation|Domain Operation]], while making progress, retry, failure, and replay visible.

Its reflected lifecycle contract distinguishes start input, immediate `TaskRunRef`, progress snapshots, typed step inputs and outputs, and eventual final output. A runtime `TaskDefinition` is a projection of this contract, not a second semantic source of truth. Runtime adapters validate every declared lifecycle schema before progress or results cross persistence, workflow, or step boundaries.

React consumers use `useDurableOperation` as a lifecycle hook, not merely a start mutation. After receiving the initial `TaskRunRef`, the hook follows task snapshots until `completed`, `failed`, or `cancelled`, exposing status, progress, final result, and error. Runtime Transport owns how those snapshots arrive: Fetch repeats the versioned `durable.operation.inspect` message, while WebSocket subscribes once and receives the same snapshot bodies by push. The operation contract and component API do not change. Polling cadence belongs to the Fetch transport or to an explicit server-side inspection observer, never to the hook or Operation bridge.

A Task that checkpoints a typed Interaction reports `waiting`, and React exposes `isWaiting`
separately from `isRunning`. Claiming the matching response returns the run to `running` before the
continuation evaluates. This one-shot wait is distinct from progress, Query observation, and domain
Event reactions.

A serializable Event wait is a separate `waiting` reason beside an Interaction. Its checkpoint
names one registered Event declaration version, stable wait identity, optional JSON correlation,
and optional timeout. A durable Event Runtime owns the retained delivery while Task Storage
atomically selects the single continuation winner. The PostgreSQL worker, Vercel Workflow and LangGraph preserve this contract with a configured
durable Event Runtime. Timeout and cancellation end the waiter subscription without deleting the occurrence.

Cache invalidation associated with a durable operation occurs when the run completes, rather than when the runtime merely accepts the start request.

A Task Run may carry one JSON-safe `TaskSubject` with a stable `type` and `id`. Server-owned
application code can reconnect domain context to execution after navigation or process restart by
asking Task Storage for recent runs with that exact subject, an explicit maximum-100 limit, and an
optional lifecycle-status filter. The selector is provider-neutral and returns projected list
items rather than private Task source state. Ontahí does not expose this as an unrestricted client
predicate: the consuming application authorizes the Principal and decides which projection to
publish.

Some workflow engines require a lightweight generated task artifact. That artifact must be a complete mechanical projection of the durable operation contract and must never become a separately authored model.

Durable admission distinguishes trusted delivery identity, the admission key, and the run ID.
The native executor, Vercel Workflow and LangGraph enforce `reuse-running` and
`skip-if-completed` when paired with atomic Task Storage.
`replace-running` and `queue-after-current` remain separate coordination work. A runtime reports
its configured enforcement capabilities through reflection.

The [Durable Operation conformance contract](../../../docs/durable-operation-conformance.md)
defines runnable cases for admission, waits, checkpoint recovery, fencing, cancellation, effect
reconciliation, and observation. Evidence applies to the tested combination of executor, Task
Storage, and Event Runtime.
