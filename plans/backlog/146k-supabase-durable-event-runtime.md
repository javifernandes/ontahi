# 146k. Supabase Durable Event Runtime

Status: backlog

Canonical ID: `ontahi://plans/146k-supabase-durable-event-runtime`

Shapes: [Event](../../atlas/items/model/event.md) and
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md).

Related plans:

1. [146j. First-Class Events Runtime Protocol Gate](../done/146j-first-class-events-runtime-protocol-gate.md)
2. [155. Adapter Capability Completeness](../done/155-adapter-capability-completeness.md)

## Summary

Evaluate and implement a Supabase/PostgREST-owned durable Event Runtime without copying direct
PostgreSQL session or transaction assumptions through the HTTP client. Supabase already implements
Data Graph and Task Storage concerns; Event acceptance, subscription registration, correlation,
leased delivery claims, acknowledgement, release, cancellation, and stale-claim fencing require
their own invoker-rights RPC and RLS design.

## Scope

1. Map the provider-neutral durable Event Runtime conformance contract to PostgREST and RPCs.
2. Preserve grants and RLS for occurrence acceptance and delivery claims.
3. Define schema, cleanup, retention, and service-role versus user-token responsibilities.
4. Prove occurrence-before-subscription, exclusive claims, lease expiry, stale fencing, and runtime
   recreation against a real Supabase-compatible stack.
5. Expose the implementation from an independent `@ontahi/supabase/events` entrypoint.

## Non-Goals

1. Do not expose direct PostgreSQL clients through the Supabase adapter.
2. Do not infer atomic Data Graph, Task, and Event persistence.
3. Do not add general history, cursor replay, broker egress, or exactly-once claims.
4. Do not weaken RLS to make the conformance suite pass.

## Acceptance

- [ ] The design states which operations are direct PostgREST writes and which require RPCs.
- [ ] The adapter passes Core's durable Event Runtime conformance suite against a real stack.
- [ ] Independent clients prove one delivery claim winner and stale-claim fencing.
- [ ] Runtime recreation recovers pending delivery without retaining callbacks or process state.
- [ ] Package exports, migrations, grants, RLS requirements, and limitations are documented.
- [ ] Todo composes Supabase Events independently from Data Graph and Task Storage.

## Closure And Evolution

Pull this plan only when Supabase Event delivery has product value beyond matrix symmetry. Until
then, the missing Event Runtime cell remains an explicit supported limitation.
