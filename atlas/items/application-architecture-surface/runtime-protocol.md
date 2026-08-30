---
id: ontahi.runtime-protocol
kind: system-primitive
title: Ontahí Runtime Protocol
parent: ontahi.application-architecture-surface
status: shaping
horizon: next
supports:
  - ontahi.data-graph-execution-routing
  - ontahi.model.operation-invocation
  - ontahi.model.durable-operation
  - ontahi.durable-workflows
  - ontahi.runtime-capability-model
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - ontahi://plans/138b-conditional-exact-entity-mutations
  - ontahi://plans/145-ordered-relations-and-sequence-commands
  - ontahi://plans/146-ontahi-runtime-protocol
---

The Ontahí Runtime Protocol is the transport-independent contract through which distributed
runtimes exchange semantic requests, results, rejections, lifecycle observations, and Events. Its
message families cover Operation invocation, Durable Operation lifecycle, Data Graph reads, Data
Graph Commands, and future Event subscription and delivery.

One protocol does not make these concepts interchangeable. Each family retains its own portable
body, authority and policy checks, execution semantics, results, caching, and lifecycle. A common
versioned envelope supplies correlation, fail-closed compatibility, shared diagnostics, capability
negotiation, and transport projection. The authoritative receiver rebuilds portable values against
its canonical application model before applying family policy and execution.

HTTP, WebSocket, gRPC, queues, process-local calls, and CLI streams are projections of this
contract. Express should expose one mounted path by default while allowing hosts to route selected
message kinds through different paths for security, limits, operations, or observability. Those
paths are deployment choices rather than distinct framework protocols.

The current implementation is converging but not unified. Operation invocation is unversioned;
Data Graph reads and Commands use separate versioned envelopes; Durable Operation start travels
through invocation while Task snapshots use another endpoint; Event intents are internal and no
remote subscription contract exists. Plan 146 owns the common envelope, dispatcher, transport
projections, Event/session semantics, specification, and conformance work.

The protocol is also the prospective boundary between Ontahí as a specification and TypeScript as
its reference implementation. A compatible implementation in another language must preserve the
portable syntax, semantic guarantees, authority boundary, results and rejections, and pass a shared
transport-neutral conformance corpus.
