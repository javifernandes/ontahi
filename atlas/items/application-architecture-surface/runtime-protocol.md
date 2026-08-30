---
id: ontahi.runtime-protocol
kind: system-primitive
title: Ontahí Runtime Protocol
parent: ontahi.application-architecture-surface
status: in-progress
horizon: now
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
  - ontahi://plans/146a-runtime-protocol-envelope-and-family-registry
  - ontahi://plans/146b-versioned-operation-protocol-family
  - ontahi://plans/146c-runtime-protocol-dispatcher
---

The Ontahí Runtime Protocol is the transport-independent contract through which distributed
runtimes exchange semantic requests, results, rejections, lifecycle observations, and Events. Its
message families cover Operation invocation, Durable Operation lifecycle, Data Graph reads, Data
Graph Commands, and future Event subscription and delivery.

One protocol does not make these concepts interchangeable. Each family retains its own portable
and independently versioned body, authority and policy checks, execution semantics, results,
caching, and lifecycle. A strict common envelope now supplies JSON framing, exchange correlation,
family routing, fail-closed compatibility, and shared protocol diagnostics. Capability negotiation
and transport projection remain later layers. The authoritative receiver rebuilds portable values
against its canonical application model before applying family policy and execution.

HTTP, WebSocket, gRPC, queues, process-local calls, and CLI streams are projections of this
contract. Express should expose one mounted path by default while allowing hosts to route selected
message kinds through different paths for security, limits, operations, or observability. Those
paths are deployment choices rather than distinct framework protocols.

Core exposes the first envelope, typed family registry, and transport-neutral dispatcher.
`operation` body version 1 preserves the existing `invoke` and `check-permission` semantics, while
`graph.read` and `graph.command` delegate to their existing canonical parsers. A canonical tuple
names all three families, and the common dispatcher routes their validated bodies to configured
family handlers without absorbing family policy or results. Handler availability is a runtime
capability: an unknown protocol family and a registered family without a local handler remain
distinct outcomes. Receiver context stays outside portable messages and is passed directly to the
selected handler.

The dispatcher does not change current HTTP paths yet: the legacy Operation HTTP body remains
unversioned during migration. Durable Operation start travels through `operation.invoke` and
returns a portable run Ref, while Task snapshots still use another unversioned endpoint. Event
intents are internal and no remote subscription contract exists.

Events are an explicit design gate. Before Event subscription or delivery joins this protocol,
Ontahí must define first-class Event declaration, identity, emission, authority, lifecycle,
ordering, and durability. BookOps provides useful evidence, not a protocol definition to copy.

The protocol is also the prospective boundary between Ontahí as a specification and TypeScript as
its reference implementation. A compatible implementation in another language must preserve the
portable syntax, semantic guarantees, authority boundary, results and rejections, and pass a shared
transport-neutral conformance corpus.
