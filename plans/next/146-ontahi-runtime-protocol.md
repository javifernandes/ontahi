# 146. Ontahí Runtime Protocol

Status: next

Canonical ID: `ontahi://plans/146-ontahi-runtime-protocol`

Related plans:

1. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
2. [132. Durable Invocation Identity And Idempotency](./132-durable-invocation-identity-and-idempotency.md)
3. [138b. Conditional Exact Entity Mutations](../done/138b-conditional-exact-entity-mutations.md)
4. [145. Ordered Relations And Sequence Commands](./145-ordered-relations-and-sequence-commands.md)

## Summary

Define one transport-independent Ontahí Runtime Protocol for communication between distributed
runtimes. Operations, Durable Operation lifecycle, Data Graph reads, Data Graph Commands, and
Events remain distinct semantic message families, but share one versioned envelope, correlation and
diagnostic model, authority boundary, and transport contract.

HTTP should expose every family through one path by default. `ontahi-express` may map selected
request kinds to separate paths when a host needs distinct routing, limits, security, or
observability. WebSocket, gRPC, process-local, queue, and CLI transports carry the same semantic
messages without pretending to be HTTP endpoints.

This protocol is the boundary from which Ontahí can be specified independently of its TypeScript
implementation. TypeScript remains the first reference implementation; other languages should be
able to implement the same syntax, semantics, policy boundary, and conformance suite.

## Current Evidence

Ontahí already has related but separately shaped runtime channels:

1. Operation invocation and permission checks.
2. Durable Operation start through invocation plus a separate Task snapshot endpoint used for
   progress and final results.
3. Versioned Data Graph reads.
4. Versioned Data Graph Commands containing Entity and Relationship Command variants.
5. Internal Event intents and ingress channels, without a remote subscription/delivery protocol.

Data Graph Commands already prove the desired semantic boundary: Entity Mutation Commands and
Relationship Commands keep different meanings and policies while sharing one message family and
dispatcher. The next step is to apply that shape across the runtime rather than add another
transport-specific bridge for each capability.

## Proposed Logical Shape

```text
Ontahí Runtime Protocol
├─ Operations
│  ├─ invoke
│  └─ check permission
├─ Durable Operations
│  ├─ start
│  ├─ inspect/progress
│  ├─ cancel
│  └─ result
├─ Data Graph
│  ├─ read
│  └─ command
│     ├─ Entity mutation
│     └─ Relationship mutation
└─ Events
   ├─ subscribe
   ├─ unsubscribe
   └─ deliver
```

A provisional request illustrates the shared outer contract without accepting final names:

```json
{
  "version": 1,
  "id": "request-123",
  "kind": "graph.command",
  "body": {
    "kind": "entity-mutation-command",
    "action": "update",
    "entityName": "Enrollment",
    "target": {},
    "values": {},
    "if": {}
  }
}
```

Responses correlate to that request and distinguish a semantic result, a semantic rejection, and a
protocol or transport-boundary error. Session transports additionally correlate subscriptions,
durable progress, and pushed Event deliveries.

## Semantic Rules

1. A message describes Ontahí intent, not Fetch, Express, SQL, PostgREST, WebSocket, or gRPC work.
2. An authoritative receiver rebuilds portable values against its canonical application model and
   applies the policy for that message family before execution.
3. Message version negotiation fails closed. A receiver must never discard an unknown condition or
   guarantee and execute a weaker request.
4. Request identity, delivery identity, durable idempotency key, run identity, attempt identity,
   subscription identity, and Event identity remain distinct even when one transport correlates
   them in a shared session.
5. Result, rejection, protocol error, and delivery failure are different outcomes.
6. One logical protocol does not erase family-specific semantics, policy, consistency, caching, or
   lifecycle.
7. A runtime may execute locally or bridge transparently. The authoring API remains the same; live
   capabilities and authority determine the route.
8. Push is an optional transport capability. Polling remains a valid Durable Operation observation
   implementation, and Event replay/resume guarantees must be explicit rather than inferred from
   WebSocket delivery.

## HTTP And Transport Projection

The default Express projection should be one `POST` path, provisionally `/runtime`, with the common
dispatcher routing by message kind. Hosts may override routing by kind, including preserving the
current `/operations`, `/graph/reads`, `/graph/commands`, and Task snapshot paths during migration.
Separate paths are deployment configuration, not separate Ontahí protocols.

A WebSocket projection can multiplex requests, responses, Durable Operation progress, and Event
deliveries over one connection. A gRPC projection can use unary calls for request/result messages
and streaming calls for subscriptions or progress. Both projections must preserve the same
semantic message bodies and diagnostics.

## Scope

1. Inventory every current remote request, response, error, version, endpoint, identity, authority,
   and retry assumption.
2. Define the common envelope and the stable message-family registry.
3. Define request/result, durable lifecycle, and subscription/session correlation semantics.
4. Implement one Core dispatcher that routes to existing canonical family dispatchers rather than
   duplicating their policy or execution logic.
5. Add an Express default single-path adapter with optional per-kind path overrides and a bounded
   compatibility path for existing clients.
6. Adapt Fetch clients to one transport without changing application-facing Operation, Query,
   Entity Command, or Relationship Command ergonomics.
7. Specify WebSocket capability negotiation and prove one pushed Durable Operation progress stream
   before general Event subscriptions.
8. Define Event subscription, delivery, acknowledgement, resume, authorization, and overflow
   semantics before presenting Events as reliable notifications.
9. Publish a developer RFC and a machine-readable conformance corpus suitable for another language
   implementation.

## Non-Goals

1. Do not make one HTTP endpoint the protocol definition.
2. Do not collapse Operations, Commands, Queries, Durable Operations, and Events into one semantic
   action type.
3. Do not duplicate Query compilation, Command policy, authorization, or Durable Operation storage
   inside the common dispatcher.
4. Do not promise reliable Event delivery, replay, ordering, or exactly-once effects from a live
   WebSocket connection alone.
5. Do not require every runtime or transport to implement every message family.
6. Do not absorb convergent/offline state, replicated ChangeSets, or ordered-sequence conflict
   resolution. Plans such as 145 may later extend this protocol with their settled atomic intent and
   evidence.

## Execution Slices

1. **Inventory and specification:** record the current messages and gaps, choose the common envelope,
   define compatibility and fail-closed versioning, and update Atlas/developer RFC material.
2. **Core dispatch:** route the common envelope to the existing Operation, Graph Read, Graph Command,
   and Task lifecycle boundaries with shared correlation and diagnostics.
3. **Express and Fetch:** make one path the default while allowing explicit per-kind paths and
   preserving a migration path for current endpoints.
4. **Durable push proof:** multiplex start, observation, progress, cancellation, and result over one
   bidirectional session without changing `useDurableOperation` semantics.
5. **Event subscription proof:** define an authorized user-notification subscription with explicit
   delivery and resume behavior, then prove identical local and bridged authoring.
6. **Specification and conformance:** publish normative JSON examples, semantic requirements, and a
   transport-neutral conformance suite; validate a minimal non-TypeScript implementation.

## Acceptance Checklist

- [ ] Every current remote message and Durable Operation lifecycle request is inventoried.
- [ ] One versioned envelope covers all registered message families without weakening their
      individual semantics.
- [ ] Unknown versions, kinds, required guarantees, and capabilities fail before execution.
- [ ] Core dispatch composes existing family dispatchers and policies instead of reimplementing them.
- [ ] Express defaults to one runtime path and supports explicit per-kind routing configuration.
- [ ] Existing endpoint users have a documented bounded migration path.
- [ ] Fetch uses one transport contract while application authoring stays unchanged.
- [ ] Durable progress can be polled or pushed without changing the Durable Operation contract.
- [ ] Event subscription has explicit authority, delivery, acknowledgement, resume, ordering, and
      overflow semantics.
- [ ] Atlas and developer documentation distinguish protocol semantics, transport projections, and
      TypeScript implementation details.
- [ ] A conformance corpus can validate an implementation that does not import Ontahí TypeScript.

## Open Questions

1. Is one monotonically versioned envelope enough, or do message families also need independent
   schema versions inside it?
2. Which response fields are common without erasing typed family-specific results and rejections?
3. How does capability negotiation work for unary-only, bidirectional, durable, and subscription
   transports?
4. Which identity belongs in the common envelope, and which identities remain inside Durable or
   Event messages?
5. Should the default HTTP projection use one `POST /runtime` path plus a streaming endpoint, or can
   SSE/WebSocket upgrade share the same mounted path cleanly?
6. Which compatibility guarantees are required before replacing the current Operation invocation,
   Graph Read, Graph Command, and Task snapshot envelopes?
7. What is the smallest Event subscription language that reuses Entity Refs, Selections, policy,
   and portable identity without turning Events into Queries?
