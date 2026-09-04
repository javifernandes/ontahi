# 146j. First-Class Events Runtime Protocol Gate

Status: research

Canonical ID: `ontahi://plans/146j-first-class-events-runtime-protocol-gate`

Parent plan: [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)

## Summary

Stop before adding Event messages to the Runtime Protocol and establish Events as first-class Ontahí
semantic values. Use the partial BookOps implementation as evidence, not as a contract to copy.

## Research Questions

1. Where are Events declared, named, reflected, emitted, and authorized?
2. How do Event identity and delivery identity differ from request, run, attempt, and subscription
   identity?
3. Which delivery, acknowledgement, resume, ordering, retention, overflow, and redaction guarantees
   can a runtime advertise honestly?
4. How do local and bridged subscriptions preserve one authoring model without turning Events into
   Queries or Reactions?
5. Which user-notification proof is small enough to validate the model before general delivery?

## Non-Goals

1. No Event WebSocket frames before the semantic model is accepted.
2. No exactly-once claim for delivery or effects.
3. No assumption that NATS, WebSocket, or a database outbox defines the Ontahí Event model.

## Exit Criteria

- [ ] Event declaration, emission, policy, lifecycle, and identity have durable Atlas definitions.
- [ ] Subscription and delivery guarantees are explicit and transport-independent.
- [ ] One bounded implementation Plan can be extracted without copying BookOps-specific behavior.
