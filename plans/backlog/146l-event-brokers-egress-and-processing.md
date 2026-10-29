# 146l. Event Brokers, Egress, And Durable Processing

Status: backlog

Canonical ID: `ontahi://plans/146l-event-brokers-egress-and-processing`

Shapes: [Event](../../atlas/items/model/event.md),
[Runtime Protocol](../../atlas/items/application-architecture-surface/runtime-protocol.md),
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md),
[Authority And Policies](../../atlas/items/authority-and-policies.md), and
[Durable Workflows](../../atlas/items/durable-workflows.md).

Related plans:

1. [146j. First-Class Events Runtime Protocol Gate](../done/146j-first-class-events-runtime-protocol-gate.md)
2. [142h. Distributed Execution Topologies](142h-distributed-execution-topologies.md)
3. [160. Semantic Modules, Composition, And System Boundaries](../research/160-semantic-modules-composition-and-system-boundaries.md)

Executable child plan:

1. [146m. Managed HTTP Event Egress](../current/146m-managed-http-event-egress.md)

## Summary

Extend the proven Event declaration, occurrence, delivery, and capability contracts toward broker
egress and durable processing without treating Kafka, RabbitMQ, NATS, Redis, or a database outbox as
the semantic model. The first-class Events work deliberately stopped at live fan-out, retained SQL
delivery, authenticated ingress, and one-shot durable Task waits.

The primary missing product is a reusable **external Event egress subscription runtime**. An
application should not have to rebuild GitHub-style webhook registration, Event selection,
destination binding, payload projection, signing, retry, suspension, and delivery history for
every deployment. Ontahí should provide that lifecycle once while applications decide which Events
may leave their boundary, who may subscribe, and how subscriptions appear in their product.

This is the outbound counterpart of Event ingress. Ingress adapters turn authenticated HTTP,
queue, broker, or provider deliveries into canonical Event occurrences. Egress adapters turn
canonical occurrences into deliveries understood by systems that do not share Ontahí's semantic
model. Communication between two Ontahí graph segments is different: it preserves canonical
Operation/Event identities through Runtime Protocol and belongs to Plan 142h even when a queue or
broker is used underneath.

Plan 160 places ingress and egress inside the broader System Boundary of an Application. That
authoring surface may group Operation and Event bindings for affordance, but this plan retains the
external Event subscription and delivery lifecycle. It does not generalize every outbound
Operation, RPC, or direct Module dependency into an Event delivery.

## External subscription boundary

The runtime should distinguish:

1. the immutable Event occurrence;
2. the external subscription definition and its policy owner;
3. one delivery created for that occurrence and subscription;
4. each transport attempt, acknowledgement, retry, suspension, or dead-letter outcome;
5. the adapter binding and secret Resources used to reach the destination.

External subscriptions are runtime state by default, not automatically domain Entities. An
application may intentionally project or model them as Entities when subscription management is
part of its domain or user experience. Provider URLs, credentials, broker topics, signing keys, and
transport retry handles never belong in Event declarations.

## Research Questions

1. Is external publication an Event Runtime implementation, an egress subscriber, or a separate
   delivery port shared by HTTP and broker adapters?
2. Which acceptance identity and retry evidence cross a broker boundary?
3. What cursor and replay contract works across retained databases and ordered logs?
4. How do version compatibility, dead-letter handling, backpressure, and poison messages appear?
5. When does a durable handler become a Task, projection, process manager, or another concept?
6. Which policy is checked at registration, publication, delivery, and replay time?
7. What minimal Event selector is safe to expose without turning subscription registration into
   arbitrary graph query authority?
8. Which payload projection, version negotiation, signing, secret rotation, and endpoint ownership
   decisions belong to the application versus the adapter?

Plan 146m now owns the first answerable vertical: one static application-admitted subscription,
one named Resource-backed HTTP destination, one transport-neutral attempt boundary, and reuse of
the existing durable Event Delivery claim lifecycle. Dynamic subscription CRUD, durable attempt
history, terminal dead letters, brokers, and the final System Boundary facade remain here or in
follow-ups extracted from that proof.

## Scope

1. Select one concrete outbound subscription vertical with a real consumer need; an HTTP webhook
   is sufficient before introducing broker infrastructure.
2. Preserve occurrence identity separately from publication and delivery attempts.
3. Define capability flags before adding a provider adapter.
4. Add provider-neutral conformance only for semantics proven by the vertical.
5. Keep advanced filtering and general Event history out until their query and authority contracts
   have independent evidence.
6. Provide application-owned policy hooks for Event visibility, subscription registration,
   destination admission, and payload projection.
7. Treat queue and broker consumers as ingress adapters that converge on the existing canonical
   Event boundary rather than a second Event model.

## Non-Goals

1. Do not promise exactly once.
2. Do not replace Task execution or Graph Query observation with a broker abstraction.
3. Do not add a lowest-common-denominator message client to Core.
4. Do not make every application Event public egress by default.
5. Do not use external egress subscriptions as the transport model for communication between
   Ontahí graph segments; Plan 142h owns runtime federation.
6. Do not force every product to expose subscription registration or model subscriptions as domain
   Entities.

## Acceptance

- [ ] One external subscription use case fixes the required semantic guarantees before a second
      HTTP, queue, or broker adapter tests portability.
- [ ] Provider topology and credentials remain outside Event declarations.
- [ ] Publication, occurrence, and delivery identities remain distinct.
- [ ] Retry, ordering, cancellation, retention, and replay claims are executable.
- [ ] Authority and payload-redaction behavior are explicit.
- [ ] Generalized work not proven by the vertical remains deferred.
- [ ] Ingress, external egress, and cross-runtime Event delivery are explicitly distinct even when
      they share a transport technology.
