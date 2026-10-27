---
id: ontahi.model.event
kind: concept
title: Event
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model.reaction
  - ontahi.model.applied-mutation-outcome
  - ontahi.runtime-capability-model
relatedPlans:
  - ontahi://plans/146j-first-class-events-runtime-protocol-gate
  - ontahi://plans/146l-event-brokers-egress-and-processing
  - ontahi://plans/142h-distributed-execution-topologies
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

The opt-in PostgreSQL and MySQL Event Runtimes provide independent stronger implementations. Each
retains occurrences and stable subscription definitions, matches an optional JSON correlation
subset, materializes one delivery per subscription and occurrence, and leases claims atomically.
Release or lease expiry preserves delivery identity and increments its attempt; acknowledgement
prevents another claim. Registration matches already-retained occurrences, so
occurrence-before-subscriber and subscriber-before-occurrence have the same result. Runtime
recreation retains pending claims and deliveries without retaining a JavaScript callback or stack.

This proof does not yet claim general cursor replay or atomic publication with a Data Graph
transaction. Both SQL runtimes report those capabilities as false. Core's
`requireDurableEventDelivery` fails early when a consumer requires retention, durable acceptance,
durable delivery, acknowledgement, and the claim API but the selected runtime cannot supply them.
The shared conformance verifier is the adapter-author boundary for these lifecycle invariants.
Passing it against two different locking and JSON implementations is evidence that the semantic
contract does not depend on PostgreSQL mechanics.

The Vercel Workflow Task adapter consumes that same durable boundary for Event waits. It registers
the canonical stable waiter subscription, uses durable workflow sleeps between claims, and asks
Task Storage to atomically claim the wait before acknowledging the Event delivery. The execution
step receives the ordinary Event Occurrence; Vercel hook or workflow identities do not enter the
Event model. Timeout and cancellation end the subscription without deleting the retained
occurrence.

Mutation Reactions enter the Event Runtime only from the existing Unit of Work post-commit queue.
Rejected and rolled-back mutations create no occurrence. Publication or subscriber failure after
commit cannot retroactively roll back domain state. Operation Effect Intents use the same built-in
interpreter. Existing raw `emit-event` values continue through an explicitly configured legacy
effector during migration, while typed Event emissions require no application-owned effector.

The browser projection is a negotiated live Runtime Protocol session capability, not a durable
Event family or history API. `event-observe` and `event-unobserve` bind a reflected declaration
through server-owned policy to the application subscription API. Delivery frames preserve the
canonical occurrence and delivery identities plus an observation-scoped sequence. Unsubscribe or
disconnect cancels the live subscription; replay, automatic resubscription, durable claims, and
arbitrary predicates are not implied.

External facts enter through the HTTP-neutral Event ingress boundary. A provider authenticates and
normalizes the original request, after which the explicit default-deny route and registered Event
declaration validate provider, channel, version, payload, correlation, and JSON safety. Rejected or
ignored deliveries do not become occurrences. Express and Next.js are host projections of this
same boundary.

Event ingress, external Event egress, and cross-runtime Event delivery are separate bindings.
Ingress turns an external delivery into a canonical occurrence. External egress matches that
occurrence against application-admitted subscriptions and projects it into webhook, queue, broker,
or provider attempts for systems that do not share Ontahí semantics. Federated delivery preserves
the canonical Event and subscription identities between identified Ontahí runtimes or graph
segments. A shared transport technology does not make those authority and lifecycle boundaries the
same.
