# 146n. Durable Event Delivery Inspection

Status: done

Canonical ID: `ontahi://plans/146n-durable-event-delivery-inspection`

Parent plan:

1. [146m. Managed HTTP Event Egress](146m-managed-http-event-egress.md)

Related plans:

1. [158. Semantic Execution Context, Governance, And Evidence](../research/158-semantic-execution-context-governance-and-evidence.md)

Shapes: [Event](../../atlas/items/model/event.md) and
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md).

## Summary

Expose the current durable Event Delivery lifecycle state already retained by PostgreSQL and MySQL
through one provider-neutral, explicitly bounded, payload-free inspection capability. Keep this
operational surface distinct from attempt history, audit retention, replay, and client disclosure.

## Contract

1. A runtime advertises `deliveryInspection` independently from `durableDelivery`.
2. Inspection is scoped to one stable subscription and requires a caller-selected limit no greater
   than 100.
3. Callers may filter by pending, claimed, acknowledged, or failed state.
4. Results contain delivery, subscription, occurrence, and Event identities; current state and
   attempt count; lifecycle timestamps; lease expiry; and bounded terminal failure reason.
5. Results exclude Event payload, correlation, causation, claim identity, and worker identity.

## Non-Goals

1. No retained record for every attempt or transport response.
2. No cursor traversal, full-history query, replay, recovery command, or dead-letter UI.
3. No automatic Runtime Protocol, browser, Devtools, or application-client exposure.
4. No authorization, redaction policy engine, retention policy, or governance decision.
5. No new storage columns or tables.

## Acceptance

- [x] Core defines a provider-neutral inspection capability and bounded query normalization.
- [x] PostgreSQL and MySQL advertise and implement the same snapshot semantics.
- [x] In-memory and workflow runtimes truthfully advertise no inspection capability.
- [x] Provider integration tests prove failed-state filtering and payload/worker exclusion.
- [x] Documentation distinguishes operational inspection from audit history and client authority.

## Closure

The slice reuses current SQL lifecycle rows and adds no storage growth beyond delivery state that
durable processing already requires. Any future projection to Devtools or a client must first make
authority and disclosure policy explicit under Plan 158. Retained attempt history requires its own
retention, redaction, and query design rather than expansion of this snapshot contract.
