---
id: ontahi.model.event
kind: concept
title: Event
parent: ontahi.model
status: shaping
horizon: now
supports:
  - ontahi.model.reaction
  - ontahi.model.applied-mutation-outcome
  - ontahi.runtime-capability-model
relatedPlans:
  - ontahi://plans/146j-first-class-events-runtime-protocol-gate
---

An [[ontahi.model.event|Event]] declaration gives one application fact a stable id, an explicit
positive integer version, documentation, and a typed Graph Schema payload. Registration through
`ontahi({ events })` validates uniqueness and makes a JSON-safe descriptor available from the
application model. A declaration contains no broker topic, credentials, subscriber callback, or
other runtime-private resource.

Calling a declaration's typed emitter produces a canonical JSON-safe Event Emission intent. The
application validates its registered identity, exact version, payload schema, and JSON safety again
at the runtime boundary. Exact integer matching is the first compatibility rule; schema migration,
fingerprints, and cross-version delivery require evidence from a retained runtime before becoming
part of the contract.

An Event Occurrence is the immutable fact accepted by the configured Event Runtime. It has one
occurrence identity, runtime-assigned time, declaration identity and version, payload, and bounded
causal provenance. A mutation-caused occurrence reuses the Applied Mutation Outcome identity chain
(`outcomeId`, `rootOutcomeId`, and optional `parentOutcomeId`) without embedding the command or live
runtime objects. An operation-caused occurrence preserves the current operation scope. Provider
credentials and Principals are not copied into the semantic envelope.

An Event Delivery is one presentation of that occurrence to one subscription. Fan-out preserves
the occurrence identity and assigns a distinct delivery and subscription identity to each
subscriber. Subscriber failure neither retracts the occurrence nor prevents other subscribers from
running. Cancellation prevents future delivery to that subscription.

Core's default Event Runtime is process-local and in-memory. It provides live subscription,
awaited concurrent fan-out, cancellation, bounded subscriber delivery time, and rejection on
overflow. The adapter explicitly provides no retention, replay, durable acceptance, durable delivery,
acknowledgement,
deduplication, atomic publication, restart guarantee, or exactly-once guarantee. A stronger adapter
must advertise only guarantees it actually implements.

The first stronger adapter is the opt-in PostgreSQL Event Runtime. It retains occurrences and
stable subscription definitions, matches an optional JSON correlation subset, materializes one
delivery per subscription and occurrence, and leases claims atomically. Release or lease expiry
preserves delivery identity and increments its attempt; acknowledgement prevents another claim.
Registration matches already-retained occurrences, so occurrence-before-subscriber and
subscriber-before-occurrence have the same result. Runtime recreation retains pending claims and
deliveries without retaining a JavaScript callback or stack.

This proof does not yet claim general cursor replay or atomic publication with a Data Graph
transaction. The PostgreSQL runtime reports those capabilities as false. Core's
`requireDurableEventDelivery` fails early when a consumer requires retention, durable acceptance,
durable delivery, acknowledgement, and the claim API but the selected runtime cannot supply them.
The shared conformance verifier is the adapter-author boundary for these lifecycle invariants.

Mutation Reactions enter the Event Runtime only from the existing Unit of Work post-commit queue.
Rejected and rolled-back mutations create no occurrence. Publication or subscriber failure after
commit cannot retroactively roll back domain state. Operation Effect Intents use the same built-in
interpreter. Existing raw `emit-event` values continue through an explicitly configured legacy
effector during migration, while typed Event emissions require no application-owned effector.
