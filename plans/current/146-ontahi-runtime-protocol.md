# 146. Ontahí Runtime Protocol

Status: current

Completed children:

1. [146a. Runtime Protocol Envelope And Family Registry](../done/146a-runtime-protocol-envelope-and-family-registry.md)
2. [146b. Versioned Operation Protocol Family](../done/146b-versioned-operation-protocol-family.md)
3. [146c. Runtime Protocol Dispatcher](../done/146c-runtime-protocol-dispatcher.md)
4. [146d. Versioned Durable Operation Observation Protocol](../done/146d-versioned-durable-operation-observation-protocol.md)
5. [146e. Runtime Transport Durable Observation](../done/146e-runtime-transport-durable-observation.md)
6. [146f. Next.js Runtime Protocol Adapter](../done/146f-nextjs-runtime-protocol-adapter.md)
7. [146g. Unified Fetch Runtime Protocol Clients](../done/146g-unified-fetch-runtime-protocol-clients.md)

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
2. Durable Operation start through invocation plus a versioned `durable.operation.inspect` and
   snapshot contract. React consumes Runtime Transport observation, Fetch implements it by polling
   the common protocol path, and the raw Task GET remains only as compatibility.
3. Versioned Data Graph reads.
4. Versioned Data Graph Commands containing Entity and Relationship Command variants.
5. Internal Event intents and ingress channels, without a remote subscription/delivery protocol.

Events are a deliberate stop gate, not merely the last transport adapter. Before an Event
subscription/delivery slice starts, Ontahí must model Events as first-class semantic values. The
partial BookOps implementation is evidence for that design review, not a protocol contract to copy.

Data Graph Commands already prove the desired semantic boundary: Entity Mutation Commands and
Relationship Commands keep different meanings and policies while sharing one message family and
dispatcher. Core now applies that shape across `operation`, `durable.operation`, `graph.read`, and
`graph.command`: one transport-neutral dispatcher validates the common request, selects a
configured family handler, passes receiver-owned context, and correlates the untouched family
result. Express can project an injected dispatcher at one path without choosing handlers or
authority for the host. Next.js can project the same dispatcher through an App Router Route
Handler with the same prevalidation, authority, correlation, and HTTP status boundary. Fetch now
composes one Runtime Transport for Operation, Durable inspection, Graph Read, and Graph Command at
`/runtime`. Family-specific endpoints require explicit compatibility selection and never receive
an automatic fallback replay.

## Proposed Logical Shape

```text
Ontahí Runtime Protocol
├─ Operations
│  ├─ invoke
│  └─ check permission
├─ Durable Operations
│  ├─ start
│  ├─ inspect/progress
│  ├─ cancel (after runtimes expose an enforceable capability)
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

A Runtime Protocol request has one strict outer envelope and a complete, independently versioned
family body:

```json
{
  "protocol": "ontahi.runtime",
  "version": 1,
  "id": "request-123",
  "kind": "request",
  "family": "graph.command",
  "body": {
    "version": 2,
    "kind": "graph-command",
    "command": {
      "kind": "entity-mutation-command",
      "action": "update",
      "entityName": "Enrollment",
      "target": {},
      "values": {},
      "if": {}
    }
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
5. **First-class Event design gate:** stop implementation, inspect Ontahí and BookOps evidence, and
   define Event identity, declaration, emission, policy, lifecycle, ordering, and durability before
   designing subscription or delivery messages.
6. **Event subscription proof:** only after that gate, define an authorized user-notification
   subscription with explicit delivery and resume behavior, then prove identical local and bridged
   authoring.
7. **Specification and conformance:** publish normative JSON examples, semantic requirements, and a
   transport-neutral conformance suite; validate a minimal non-TypeScript implementation.

## Acceptance Checklist

- [x] Every current remote message and Durable Operation lifecycle request is inventoried.
- [x] One versioned envelope covers all registered message families without weakening their
      individual semantics.
- [ ] Unknown versions, kinds, required guarantees, and capabilities fail before execution.
- [x] Core dispatch composes existing family dispatchers and policies instead of reimplementing them.
- [x] Express defaults its common projection to one runtime path and supports explicit
      family-specific compatibility routes.
- [x] Existing endpoint users have a documented bounded migration path.
- [x] Fetch uses one transport contract while application authoring stays unchanged.
- [ ] Durable progress can be polled or pushed without changing the Durable Operation contract.
- [ ] Event subscription has explicit authority, delivery, acknowledgement, resume, ordering, and
      overflow semantics.
- [x] Atlas and developer documentation distinguish protocol semantics, transport projections, and
      TypeScript implementation details.
- [ ] A conformance corpus can validate an implementation that does not import Ontahí TypeScript.

## Open Questions

1. How does capability negotiation work for unary-only, bidirectional, durable, and subscription
   transports?
2. What enforceable cancellation contract can Task Runtimes share before `durable.operation`
   accepts a cancel request?
3. Which identity belongs in the common envelope beyond exchange correlation, if any, and which
   identities remain inside Durable or
   Event messages?
4. Should the default HTTP projection use one `POST /runtime` path plus a streaming endpoint, or can
   SSE/WebSocket upgrade share the same mounted path cleanly?
5. What is the smallest Event subscription language that reuses Entity Refs, Selections, policy,
   and portable identity without turning Events into Queries?

## Settled Foundations

1. Envelope and family schema versions are independent. A new family-body guarantee does not
   force an unrelated common-envelope version, and an old receiver rejects either unknown version.
2. The outer response correlates by request id and family. Its body remains the complete typed
   family result or rejection; the common protocol does not reinterpret those semantics.
3. Request `id` identifies one exchange only. Durable run, attempt, delivery, subscription, Event,
   and idempotency identities remain inside the family that defines their lifecycle.
4. Authority is transport-derived receiver context and is never client-authored into a portable
   envelope.
5. Operation invocation and permission checks share the `operation` family. Its version 1 body
   preserves the existing `invoke` and `check-permission` discriminants; a Durable Operation starts
   through `invoke` and returns its run identity as an ordinary Operation result.
6. Common dispatch uses optional handlers keyed by registered family. A known family without a
   handler is an unavailable runtime capability rather than an unknown protocol family; trusted
   receiver context is passed beside, never inside, the portable request.
7. Durable Operation observation is `durable.operation.inspect` plus a versioned snapshot.
   Progress, result, error, and cancelled state are snapshot values. React delegates observation to
   Runtime Transport; Fetch polls and any push-capable transport may yield the same asynchronous
   snapshot sequence without changing hook semantics. Poll cadence belongs to Fetch transport
   configuration, not React or the Operation bridge. Cancellation is not a request until runtimes
   can enforce it.
8. Express Runtime Protocol projection is opt-in and handler-neutral. It validates the envelope
   before deriving receiver-owned context and dispatches only the family handlers explicitly
   installed by the host; no Durable observation authority is inferred by the adapter.
9. Next.js Runtime Protocol projection has the same handler-neutral and authority-neutral boundary.
   It adapts only Web `Request`/`Response`, validates before deriving server context, preserves
   Express HTTP status semantics, and routes every registered family through the injected common
   dispatcher without its own family switch.
10. Fetch creates one common family exchange per client over a single Runtime Transport. Operation,
    Graph Read, Graph Command, and Durable inspection all default to `/runtime`; family parsers and
    semantic result/rejection behavior remain separate. Legacy endpoints are selected explicitly
    per family before transmission, with no automatic fallback or replay.

## Request/Response Closure Audit

Plan 146g completes the executable TypeScript request/response path for every currently registered
family across Core, Fetch, Express, and Next.js. The remaining work before the request/response
portion can be considered specification-complete is bounded to:

1. define capability and required-guarantee negotiation beyond the existing distinction between an
   unknown family and a registered-but-unavailable family;
2. publish normative examples and a machine-readable conformance corpus, then validate a minimal
   implementation that does not import Ontahí TypeScript;
3. collect downstream migration evidence and define a release boundary before removing the legacy
   Operation, Graph Read, Graph Command, or raw Task snapshot routes;
4. add Durable cancellation only after Task Runtimes expose an enforceable cancellation capability.

Durable push and the first-class Event design gate remain later phases. This audit does not start
Event subscription, delivery, acknowledgement, replay, or transport work.
