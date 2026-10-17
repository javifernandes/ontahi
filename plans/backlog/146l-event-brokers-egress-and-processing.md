# 146l. Event Brokers, Egress, And Durable Processing

Status: backlog

Canonical ID: `ontahi://plans/146l-event-brokers-egress-and-processing`

Shapes: [Event](../../atlas/items/model/event.md) and
[Durable Workflows](../../atlas/items/durable-workflows.md).

Related plan:

1. [146j. First-Class Events Runtime Protocol Gate](../done/146j-first-class-events-runtime-protocol-gate.md)

## Summary

Extend the proven Event declaration, occurrence, delivery, and capability contracts toward broker
egress and durable processing without treating Kafka, RabbitMQ, NATS, Redis, or a database outbox as
the semantic model. The first-class Events work deliberately stopped at live fan-out, retained SQL
delivery, authenticated ingress, and one-shot durable Task waits.

## Research Questions

1. Is broker publication an Event Runtime implementation, an egress subscriber, or a separate port?
2. Which acceptance identity and retry evidence cross a broker boundary?
3. What cursor and replay contract works across retained databases and ordered logs?
4. How do version compatibility, dead-letter handling, backpressure, and poison messages appear?
5. When does a durable handler become a Task, projection, process manager, or another concept?
6. Which policy is checked at registration, publication, delivery, and replay time?

## Scope

1. Select one concrete broker-backed vertical with a real consumer need.
2. Preserve occurrence identity separately from publication and delivery attempts.
3. Define capability flags before adding a provider adapter.
4. Add provider-neutral conformance only for semantics proven by the vertical.
5. Keep advanced filtering and general Event history out until their query and authority contracts
   have independent evidence.

## Non-Goals

1. Do not promise exactly once.
2. Do not replace Task execution or Graph Query observation with a broker abstraction.
3. Do not add a lowest-common-denominator message client to Core.
4. Do not make every application Event public egress by default.

## Acceptance

- [ ] One broker-backed use case fixes the required semantic guarantees.
- [ ] Provider topology and credentials remain outside Event declarations.
- [ ] Publication, occurrence, and delivery identities remain distinct.
- [ ] Retry, ordering, cancellation, retention, and replay claims are executable.
- [ ] Authority and payload-redaction behavior are explicit.
- [ ] Generalized work not proven by the vertical remains deferred.
