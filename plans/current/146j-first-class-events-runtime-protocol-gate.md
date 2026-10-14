# 146j. First-Class Events And Configurable Event Runtime

Status: current

Canonical ID: `ontahi://plans/146j-first-class-events-runtime-protocol-gate`

Shapes: Event declarations, Event Occurrences, Event Deliveries, Event Runtime capabilities,
Reaction emission, and event-backed durable continuation.

Related plans:

1. [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)
2. [135. Applied Mutation Outcomes And Reactions](../done/135-applied-mutation-outcomes-and-reactions.md)
3. [135b. Declarative Reaction Authoring And Registration](../done/135b-declarative-reaction-authoring-and-registration.md)
4. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)
5. [153c. Interactive And Resumable Operation Execution](./153c-operation-interactions-and-resumption.md)
6. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)
7. [154d. Semantic Mutation Journal And Query Invalidation](../done/154d-semantic-mutation-journal-and-query-invalidation.md)
8. [154f. Wait And Durable Continuation Semantics](../done/154f-wait-and-continuation-semantics.md)

## Summary

Make domain Events a first-class Ontahí application concept alongside Entities, Relations,
Operations, Reactions, and Policies. Applications should declare typed Events and emit or consume
them without registering a generic `emit-event` effector. Ontahí should own the semantic contract,
validation, reflection, policy, causality, and Activity model while letting an application choose
the runtime machinery that provides publication, retention, subscription, acknowledgement,
ordering, replay, and delivery.

The central architecture is:

```text
typed Event emission
        │
        ▼
canonical EventEmission intent
        │
        ▼
Unit of Work / post-commit journal
        │
        ▼
built-in Ontahí Event interpreter
        │
        ▼
configured Event Runtime
  ├─ in-memory live delivery
  ├─ transactional outbox
  ├─ queue / broker adapter
  └─ custom runtime capability
        │
        ▼
Event Occurrence ──► Event Deliveries / subscriptions / durable waits
```

The semantic application code must remain valid when the implementation changes. A Reaction that
emits `StudentCourseAssigned` should not know whether the occurrence is delivered in-process,
written to a PostgreSQL outbox, published through NATS, or retained for replay. The configured
Event Runtime must advertise its real capabilities, and Ontahí must not silently upgrade a
best-effort implementation into a durable guarantee.

This plan deliberately starts below Runtime Protocol. The first proof is local and transactional.
Protocol messages, browser subscriptions, and durable event waits follow only after the local
model establishes what is being transported and persisted.

## Why This Plan Exists Now

Ontahí already has several incomplete projections of Events:

1. Operation results may contain a generic `emit-event` Effect Intent with an unconstrained
   `unknown` value.
2. Mutation Reactions may return `emit-event` intents, also carrying `unknown`.
3. Application hosts may register an `emit-event` effector to interpret those intents.
4. Reactions already delay local interpretation until a Data Graph Unit of Work commits and
   discard pending work on rollback.
5. Task triggers can record `external_event` as provenance, but the referenced event is only a
   string.
6. Explorer may display application-specific event descriptors, but Core owns no declaration or
   occurrence contract behind that presentation.
7. Durable Task Runs can wait for typed Interactions, but not for a declared domain Event.

That machinery is useful evidence, not yet a coherent Event model. Today an application must
invent event identity, payload validation, publication, policy, subscription, failure handling,
delivery identity, and observability. A custom effector cannot be reflected, transported, or
reasoned about as an Ontahí Event capability.

Events should be designed before bounded distributed evaluation in Plan 154. Otherwise runtime
delegation will need an ad hoc messaging mechanism and accidentally define Event semantics through
transport details.

## Design Thesis

> An Event is a declared kind of fact. An Event Occurrence is one immutable, causally identified
> fact that happened. An Event Delivery is one runtime attempt to present that occurrence to one
> subscriber. Ontahí owns those meanings; an Event Runtime implements selected guarantees.

Consequences:

1. An Event declaration is part of the reflected application model, not a broker topic string.
2. Emission produces a semantic intent before it produces an occurrence.
3. An occurrence is created only when the owning Event Runtime accepts the emission according to
   its advertised contract.
4. One occurrence may produce zero, one, or many deliveries.
5. Occurrence identity and delivery identity are different.
6. Subscriber failure does not retract the occurrence or roll back an already committed mutation.
7. Transport, persistence, replay, acknowledgement, and ordering are runtime capabilities rather
   than properties inferred from the word “Event.”
8. Events are not Query snapshots, Operation progress, Interactions, mutation deltas, or generic
   logs even when implementations reuse streaming or storage machinery.

## Semantic Vocabulary

The names in this section state intended semantics. Exact public TypeScript names remain subject to
the first implementation proof.

| Concept            | Meaning                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Event Declaration  | Stable application-level identity, payload schema, documentation, version, and policy metadata for one kind of fact |
| Event Emission     | A validated intent to record that one declared kind of fact occurred with a payload                                 |
| Event Occurrence   | Immutable accepted fact with stable occurrence identity, payload, time, and causal provenance                       |
| Event Subscription | Declared or runtime-scoped interest in future occurrences of one or more Event declarations                         |
| Event Delivery     | One attempt to present one occurrence to one subscription or durable waiter                                         |
| Event Runtime      | Configured interpreter that materializes emissions and implements an explicit capability set                        |
| Event Ingress      | Trusted adapter that authenticates and normalizes an external fact into one declared Event emission                 |
| Event Egress       | Subscriber or delivery adapter that projects occurrences to an external system                                      |
| Event Wait         | Persisted one-shot continuation expecting one matching occurrence                                                   |
| Reaction           | Modeled rule that derives follow-up intents from an applied mutation outcome or, later, an Event Occurrence         |
| Effector           | Low-level interpreter for an opaque or framework-internal effect; an escape hatch, not the Event authoring model    |

### Boundaries that must remain explicit

| Surface                | Primary meaning                                      | Lifecycle                             | Result semantics                                                            |
| ---------------------- | ---------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Operation Invocation   | Request to perform domain behavior                   | Bounded execution                     | One typed result or failure                                                 |
| Graph Command          | Requested graph mutation                             | Bounded execution                     | Applied/not-applied outcome and delta                                       |
| Event Occurrence       | Fact that has happened                               | Immutable occurrence                  | No implied response                                                         |
| Event Delivery         | Attempt to convey a fact                             | Per subscriber and occurrence         | Accepted, acknowledged, retried, failed, or dropped according to capability |
| Interaction            | Typed question addressed to a participant            | One response resumes one continuation | Exactly one accepted response                                               |
| Query Observation      | Current semantic value and later revisions           | Open until cancelled                  | Complete current value, then replacements                                   |
| Operation Progress     | Report about one running execution                   | Ends with the run                     | Neither a fact subscription nor a result                                    |
| Mutation Journal Entry | Runtime evidence used for invalidation and causality | Unit-of-work scoped                   | Not automatically a public domain Event                                     |

An Event may cause an Operation, resume a wait, or prompt a cache refresh, but it does not become
any of those concepts.

## Application Model

### Event declaration

An application registers Events as reflected definitions. A declaration needs at least:

1. a stable, non-empty application-scoped identifier;
2. a JSON-safe payload schema;
3. human-facing documentation suitable for Explorer and Devtools;
4. explicit version or compatibility identity when persisted occurrences may outlive a deployment;
5. emission, subscription, and ingress policy hooks or references;
6. redaction metadata for diagnostics and inspection.

A declaration must not contain broker subjects, queue URLs, WebSocket paths, provider credentials,
or executable delivery callbacks. Those belong to Event Runtime configuration and adapters.

Illustrative authoring, not a frozen API:

```ts
const StudentCourseAssigned = event.define({
  id: 'StudentCourseAssigned',
  payload: Schema.Struct({
    student: Student.ref,
    course: Course.ref,
  }),
  description: 'A student was assigned to a course.',
});

const application = ontahi({
  entities: [Student, Course],
  events: [StudentCourseAssigned],
  reactions,
  eventRuntime,
});
```

Registration makes the declaration addressable through the application model. It does not publish
anything and does not subscribe the application implicitly.

### Typed emission

Semantic code emits through a declaration, so payload inference and runtime validation share the
same schema:

```ts
emit(StudentCourseAssigned, {
  student: outcome.command.member,
  course: outcome.command.source,
});
```

The emission lowers to a JSON-safe canonical intent containing declaration identity, declaration
version, validated payload, and causal context available at the boundary. It never carries the
declaration object, a callback, credentials, or a transport handle across a durable boundary.

Both Operation effects and Mutation Reactions should lower to this same intent. A Reaction-specific
event API may improve inference, but it must not create a second occurrence contract.

### Occurrence envelope

The first local proof should establish a canonical occurrence envelope with these conceptual
fields:

```text
occurrenceId       stable identity of this fact
eventId            declared Event identity
eventVersion       declared payload/compatibility version
occurredAt         runtime-assigned acceptance time
payload            validated JSON-safe value
causation          Task Run, Operation invocation, mutation outcome, or ingress identity
correlation        optional application-supplied correlation values
```

OpenTelemetry trace identifiers and transport metadata may accompany diagnostics, but they are not
the domain identity of the occurrence. Principal and ingress evidence must be retained for policy
and audit without blindly copying credentials into the envelope.

Whether `occurredAt` is supplied by trusted ingress or assigned by the receiving runtime is an
explicit ingress decision. It must not be accepted as arbitrary client truth.

### Occurrence versus delivery identity

One accepted occurrence keeps the same `occurrenceId` through fan-out and replay. Each subscriber
attempt has its own `deliveryId` and may additionally have an attempt number. Therefore:

```text
StudentCourseAssigned occurrence O-17
  ├─ delivery D-31 to activity-feed subscription, attempt 1, acknowledged
  └─ delivery D-32 to audit subscription, attempt 1, failed
                                            attempt 2, acknowledged
```

Retrying D-32 must not manufacture another domain occurrence. Republishing the same external fact
may still create a duplicate occurrence unless ingress supplies and the runtime enforces a stable
deduplication identity. Exactly-once processing is not a baseline claim.

## Event Runtime Boundary

The Event Runtime is an application runtime capability, not another network transport in Runtime
Transport routing. Runtime Transport moves Ontahí protocol messages between a client and an Ontahí
runtime. Event Runtime materializes and distributes domain facts, potentially through a database,
broker, queue, or local dispatcher.

Its minimum conceptual interface must cover:

1. accepting one canonical emission and returning an occurrence or acceptance record;
2. subscribing to declared occurrences with cancellation;
3. exposing a capability descriptor;
4. reporting delivery and publication evidence for Activity and diagnostics;
5. optionally retaining, replaying, acknowledging, retrying, and dead-lettering deliveries;
6. optionally participating in the same atomic commit mechanism as graph mutation storage.

Provider-specific clients and credentials remain private to the adapter. Application semantic code
must not import them.

### Capability matrix

Every Event Runtime must advertise only guarantees it implements. The initial vocabulary should be
small and evidence-driven, but it must distinguish at least:

| Capability         | Question answered                                                                 |
| ------------------ | --------------------------------------------------------------------------------- |
| Live subscription  | Can active subscribers receive future occurrences?                                |
| Retention          | Can an occurrence be read after active publication finishes?                      |
| Replay             | Can a subscriber request retained occurrences from a cursor or time?              |
| Durable acceptance | Does acceptance survive process loss?                                             |
| Durable delivery   | Will unacknowledged delivery be retried after process loss?                       |
| Acknowledgement    | Can a subscriber explicitly complete or reject a delivery?                        |
| Ordering scope     | Is order preserved globally, per Event, per key, per subscription, or not at all? |
| Deduplication      | Can a stable ingress/emission key suppress duplicate occurrence creation?         |
| Atomic publication | Can occurrence persistence share the domain mutation commit boundary?             |
| Overflow behavior  | Does the runtime block, drop, reject, spill, or disconnect under pressure?        |

Configuration must fail early when a declared consumer requires a capability the selected runtime
does not provide. A durable Event Wait cannot silently run on an ephemeral runtime that loses early
or in-flight occurrences on restart.

### Default in-memory runtime

Ontahí should provide a zero-configuration in-memory Event Runtime so first-class Events do not
force infrastructure on every application. Its honest initial contract is:

1. process-local live subscription;
2. synchronous or queued fan-out with explicit bounded overflow behavior;
3. no persistence, replay, durable acknowledgement, or restart guarantee;
4. no exactly-once or cross-process ordering claim;
5. occurrence and delivery evidence visible while diagnostics retain it;
6. subscriber isolation: one failed subscriber does not prevent another from receiving;
7. cancellation prevents future delivery to that subscription.

The default is appropriate for local integration, transient UI activity, and tests. It is not
appropriate for a continuation that must survive process loss.

### Stronger runtimes

Adapters may provide stronger capability combinations without changing declarations or emissions:

1. PostgreSQL transactional outbox for atomic occurrence persistence with graph mutation storage;
2. PostgreSQL inbox/subscription tables for durable delivery, claim, retry, and acknowledgement;
3. Redis, NATS, Kafka, or queue-backed publication and consumer groups;
4. hosted provider adapters;
5. application-specific runtimes implementing the Ontahí boundary.

An outbox and a broker solve different parts of the lifecycle. A database transaction may atomically
record an occurrence without atomically delivering it to an external consumer. The runtime must
report those stages separately.

## Unit Of Work And Commit Semantics

Event emission caused by a graph mutation or atomic Operation must join the existing Unit of Work
as an intent. Ontahí should not publish an externally visible fact before the mutation commits.

Required invariants:

1. a rejected or rolled-back mutation creates no occurrence;
2. a successful commit makes its queued emissions eligible for materialization;
3. repeated Reaction evaluation within one Unit of Work must not create accidental duplicates;
4. causal evidence links the occurrence to the committed mutation outcome or Operation run;
5. publication failure after commit cannot retroactively mark committed domain state as rolled back;
6. the caller and Devtools can distinguish committed state with successful publication, pending
   durable publication, and failed best-effort publication.

Guarantees depend on the adapter:

| Runtime integration                              | Honest guarantee                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| In-memory after-commit queue                     | Mutation commits first; publication is process-local best effort                  |
| Transactional outbox sharing storage transaction | Mutation and occurrence record commit atomically; external delivery remains later |
| External broker without shared transaction       | Commit then publish, with an observable failure window and optional retry         |

This reuses the semantic mutation journal and Unit of Work but does not turn every journal entry into
a public Event. Domain Events remain explicitly declared and intentionally emitted.

## Policy, Authority, And Privacy

First-class Events create three independent authority questions:

1. **Emission:** may this execution and Principal record this declared fact?
2. **Subscription:** may this Principal or service observe occurrences and payload fields?
3. **Ingress:** may this external adapter assert this fact, with this provenance and deduplication
   identity?

Emission through a Reaction inherits causal provenance but not unlimited authority. A subscriber
does not inherit the emitter's Principal. Persistent handlers and delivery workers run under an
explicit service identity or application policy context.

Reflection may expose Event names and documentation without exposing sensitive payloads. Diagnostics
and Devtools must apply declaration redaction to occurrence and delivery bodies. Event payloads
must never carry secrets merely to give an adapter access to them; runtime resources remain outside
the serialized semantic envelope.

## Ingress And Egress

An external webhook, queue message, or provider callback is not automatically a trusted Event
Occurrence. Event ingress has four steps:

```text
provider payload
  -> adapter authentication and replay protection
  -> normalization to declared payload
  -> Event policy and schema validation
  -> accepted Event Occurrence with ingress provenance
```

Provider request identity, signature evidence, received time, and deduplication key belong to
ingress metadata. The normalized domain payload remains provider-independent.

An integration such as GitHub may therefore expose a declared domain Event as its application
boundary even when the technological implementation is an HTTP webhook. The webhook handler is
an ingress adapter, not an HTTP-shaped domain Operation: after authentication and normalization,
downstream waits, Reactions, and Operations depend on the declared Event and remain independent of
GitHub and HTTP. Direct webhook-to-Operation dispatch remains valid when no durable domain fact is
useful; the two forms are intentional alternatives rather than aliases.

Outbound webhooks, notifications, and queue publication are modeled as subscribers or Event
Runtime delivery adapters. They do not require applications to reintroduce a generic `emit-event`
effector. Custom effectors remain available for opaque external effects that are not domain Events.

## Reactions And Effectors

The existing generic Effect Intent machinery remains valuable as an interpreter boundary and
escape hatch. This plan changes who must configure it and what application code sees:

```text
Today
Reaction -> { kind: 'emit-event', event: unknown }
         -> application-registered effector

Target
Reaction -> typed EventEmission
         -> built-in Ontahí Event interpreter
         -> configured Event Runtime
```

Compatibility rules:

1. existing opaque `run-effect` support remains an escape hatch;
2. existing raw `emit-event` values receive a bounded migration path or compatibility adapter;
3. new application code should not register an `emit-event` effector;
4. typed Events validate before entering a durable envelope or Unit of Work;
5. Reaction `delivery: inline | best-effort | durable` must be reconciled with Event Runtime
   capabilities instead of independently pretending to provide Event delivery semantics;
6. Reaction execution evidence should reference the accepted occurrence identity.

The first slice must decide whether Reaction delivery continues to govern scheduling of the
Reaction itself while Event delivery governs the resulting occurrence. Those are likely separate
lifecycles and must not share one ambiguous `delivery` field.

## Subscriptions

The first subscription surface is programmatic and headless. It should subscribe by declaration,
receive the canonical occurrence, and return cancellation. It must not require React, Runtime
Protocol, or a broker-specific consumer API.

Illustrative only:

```ts
const subscription = application.events.subscribe(StudentCourseAssigned, occurrence => {
  activity.push(occurrence.payload);
});

subscription.cancel();
```

The local API must leave room for durable consumers without pretending callback execution is
durable. A later durable declaration needs stable subscription identity, consumer authority,
delivery claim/acknowledgement, retry policy, and version compatibility.

Filtering should initially be declaration identity plus a small serializable correlation match.
Arbitrary callback predicates cannot be persisted, transported, authorized, or indexed. General
Selection algebra over Event history is outside the first proof.

## Event Waits And Continuations

Plan 154f established that `waiting` currently means exactly one pending typed Interaction. An
Event wait extends the reason for suspension; it must not make Events a kind of Interaction.

A future Task snapshot should be able to explain what the run is waiting for:

```text
waitingOn:
  kind: event
  eventId: TodoListExportReady
  correlation: { requestId }
```

The persisted wait specification must be serializable and validate against a registered Event
declaration. It cannot store an arbitrary JavaScript predicate or stack. Resumption atomically
claims one matching occurrence/delivery and returns the Task Run to `running` before evaluating the
continuation.

This plan does not start by adding `waitForEvent`. First it proves declaration, occurrence,
delivery, retention, and correlation. A restart-safe wait is only valid on an Event Runtime whose
capabilities preserve matching occurrences across the registration, process-loss, and resumption
windows.

## Runtime Protocol Gate

No Event WebSocket or HTTP family should be added during the local semantic proof. Once occurrence
and subscription behavior is stable, the protocol slice must decide which capabilities genuinely
need transport:

1. reflect declared Events;
2. subscribe and cancel a live Event stream;
3. carry occurrences without exposing provider envelopes;
4. report delivery cursor, overflow, disconnect, and resume semantics;
5. ingest an external Event through a policy-aware server boundary;
6. inspect publication and delivery evidence;
7. resume a waiting Task Run through the Event Runtime rather than a transport-local callback.

One authoring model should work for local and bridged subscriptions. Protocol observation identity
remains transport-local; occurrence, subscription, delivery, and Task Run identities remain
semantic/runtime identities.

## Reflection, Explorer, And Devtools

Reflection should expose declaration identity, payload shape, documentation, version, policy hints,
and required runtime capabilities. It should not expose credentials or adapter topology.

Devtools should tell a causal story rather than list every transport packet as top-level Activity:

```text
TodoList.completeAll()
  Effects
    emitted TodoListCompleted · occurrence O-42
    delivered to Todo activity · D-91
  Runtime trace
    mutation committed
    in-memory publication accepted
```

An Event Activity detail should distinguish occurrence from each delivery, show declared payload
through redaction, identify causal Operation/Command/Reaction, and explain retained/replayed/retried
status. Protocol subscription refreshes and internal acknowledgements should be nested technical
evidence, not competing domain activities.

Explorer should derive an Event catalog and payload form from the same declaration metadata. It
must not keep a parallel application-authored event descriptor model after Core reflection exists.

## Vertical Proofs

### Vertical A: Core semantic and transactional proof

Reuse the existing Student/Course Reaction fixture:

```text
Course.students.add(Student)
  -> Applied Mutation Outcome
  -> Reaction
  -> StudentCourseAssigned { student, course }
```

This vertical establishes the irreducible local model without Runtime Protocol or Todo UI.

Acceptance:

- [x] Register `StudentCourseAssigned` as a typed Event declaration.
- [x] Infer and validate its payload at authoring and runtime boundaries.
- [x] Lower Reaction emission to one canonical JSON-safe EventEmission intent.
- [x] Create exactly one occurrence only after successful Unit of Work commit.
- [x] Create no occurrence after rejection or rollback.
- [x] Deliver the same occurrence to two live subscribers with distinct delivery identities.
- [x] Prove one subscriber failure does not retract the occurrence or block the other subscriber.
- [x] Prove cancellation prevents later delivery.
- [x] Reflect the Event declaration from the application model.
- [x] Require no application-owned `emit-event` effector.
- [x] Expose honest in-memory Event Runtime capabilities.

### Vertical B: Todo end-to-end event flow

Use the existing bulk Operation:

```text
TodoList.completeAll(list)
  -> completed N items
  -> TodoListCompleted { list, completedCount: N }
```

One bulk domain action emits one intentional occurrence, not one occurrence per affected row. Cache
refresh remains driven by semantic mutation invalidation; the Event is not a replacement cache key
or a bulk mutation delta.

Acceptance:

- [x] Declare and reflect `TodoListCompleted` in the Todo application.
- [x] Emit one occurrence with Todo List Ref and completed count from the committed Operation.
- [x] Consume it from one headless subscriber using the same declaration.
- [x] Add a small Todo activity projection proving a browser consumer can subscribe.
- [x] Add the minimum Runtime Protocol family required by that browser subscription only after
      Vertical A fixes the semantic envelope.
- [x] Display the occurrence and delivery causally beneath `TodoList.completeAll()` in Devtools.
- [x] Keep the existing automatic Query refresh behavior unchanged and separately inspectable.
- [x] Prove disconnect, cancellation, overflow, and payload redaction behavior.

### Vertical C: External ingress and durable Event wait

Add a bounded export workflow:

```text
TodoList.export(list)
  -> dispatch export request with requestId
  -> Task Run waitingOn TodoListExportReady { requestId }
  -> external worker callback / queue message
  -> authenticated Event ingress
  -> TodoListExportReady { requestId, url }
  -> matching run resumes and completes with { url }
```

This vertical requires a runtime with retention and durable claim semantics. It must not claim
restart safety using the default ephemeral runtime.

Acceptance:

- [x] Authenticate and normalize one external provider payload into a declared Event occurrence.
- [x] Persist a serializable Event wait with exact declaration and correlation data.
- [x] Resume after Task Runtime recreation without retaining a JavaScript stack.
- [x] Handle occurrence-before-observer and observer-before-occurrence ordering explicitly.
- [x] Atomically allow one matching occurrence to advance one one-shot continuation.
- [x] Reject unauthorized ingress, invalid payloads, stale declarations, and mismatched correlation.
- [x] Define duplicate occurrence and duplicate delivery behavior without claiming exactly once.
- [x] Define timeout and cancellation ownership without erasing the occurrence.
- [x] Show ingress, occurrence, claimed delivery, wait, resume, and completion in one causal Activity.

## Execution Slices

Each slice should be a coherent PR-sized vertical, not a package-by-package layer. Adjacent slices
may share a PR when the behavior remains reviewable and verification stays focused.

### Slice 0: Contract inventory and terminology

- [x] Inventory current Effect Intent, Mutation Reaction, Unit of Work, Task trigger, reflection,
      and Explorer event-shaped surfaces.
- [x] Fix the occurrence/delivery/subscription/wait vocabulary in this plan.
- [x] Decide the minimal declaration version and compatibility contract.
- [x] Decide how causal provenance reuses Task Run, Operation invocation, and mutation outcome
      identities without embedding runtime-private objects.

### Slice 1: Typed declaration and in-memory Event Runtime

- [x] Implement Event declaration, registration, reflection, and payload validation.
- [x] Implement canonical EventEmission and EventOccurrence values.
- [x] Implement the built-in in-memory Event Runtime and capability descriptor.
- [x] Implement headless live subscription and cancellation.
- [x] Complete Vertical A.

### Slice 2: Unit of Work and Reaction integration

- [x] Journal Event emissions until successful commit and discard them on rollback.
- [x] Route typed Reaction emissions through the built-in interpreter.
- [x] Reconcile Reaction scheduling delivery with Event occurrence delivery.
- [x] Preserve publication failure as post-commit evidence rather than mutation rollback.
- [x] Add a migration path for raw `emit-event` intents and host effectors.

### Slice 3: Todo, protocol, and inspection

- [x] Complete Vertical B without replacing semantic cache invalidation.
- [x] Add only the protocol operations demanded by the browser proof.
- [x] Project Event declaration and activity through Explorer and Devtools.
- [x] Specify live subscription cancellation, disconnect, overflow, and reconnection behavior.

### Slice 4: Durable adapter proof

- [x] Define stable subscription, delivery, claim, acknowledgement, retry, and retention contracts.
- [x] Implement one durable runtime or transactional outbox/inbox proof.
- [x] Prove capability mismatch fails at configuration or wait registration.
- [x] Keep provider storage schema and credentials private to the adapter.
- [x] Verify the durable contract against a second independent provider through MySQL 8.4/InnoDB.

### Slice 5: External ingress and Event continuation

- [x] Implement policy-aware Event ingress with provenance and deduplication identity.
- [x] Bind declared Event ingress through the Express host while preserving the provider's raw
      request for authentication and normalization.
- [x] Bind the same HTTP-neutral Event ingress contract through a Next.js App Router Route Handler.
- [x] Generalize Task `waiting` evidence from Interaction-only to an explicit waiting reason.
- [x] Implement serializable correlated Event wait and atomic resume.
- [x] Complete Vertical C on the native Task Runtime and evaluate a second runtime only after the
      contract is stable.

The causal Activity is reconstructed from the existing Task observation stream. A running snapshot
retains compact, payload-free resume evidence for the matched occurrence, durable delivery claim,
and ingress provenance; it does not introduce a general Event history API. The LangGraph adapter was
evaluated as the second runtime and rejects Event-wait transitions explicitly until it can preserve
the same durable semantics.

The first Express binding requires Operation ingress and Event ingress to use distinct HTTP paths.
This avoids making middleware registration order decide whether one authenticated provider delivery
means an Operation invocation or an Event occurrence. Shared-path multiplexing remains deferred
until the provider outcome can be evaluated once and routed semantically after normalization.

### Slice 6: Durable knowledge and protocol decision

- [ ] Create or update the smallest Atlas items for the proven Event Declaration, Occurrence,
      Delivery, and Event Runtime boundaries.
- [ ] Update Reaction and Durable Operation Atlas items with the proven integration.
- [ ] Decide which Event protocol operations are stable enough to remain public.
- [ ] Extract broker-specific, advanced filtering, or generalized event-processing work into linked
      follow-up plans.

## Testing Strategy

1. Compile-time tests prove payload inference from Event declarations and reject wrong authoring.
2. Runtime schema tests reject forged, stale-version, non-JSON-safe, and malformed emissions.
3. Unit of Work integration tests prove commit-before-occurrence and rollback-without-occurrence.
4. Fan-out tests prove stable occurrence identity and distinct delivery identity.
5. Failure-injection tests cover subscriber failure, publication failure, overflow, cancellation,
   duplicate delivery, and adapter loss.
6. Capability conformance suites run against in-memory and every durable adapter.
7. Policy tests independently cover emission, subscription, and ingress authority.
8. Protocol tests assert semantic occurrence and cancellation behavior rather than WebSocket frame
   ordering except where ordering is itself the contract.
9. Task Runtime tests cover restart, correlation, early occurrence, timeout, cancellation, duplicate
   claim, and unauthorized ingress.
10. Devtools tests group internal publication and delivery evidence beneath causal domain Activity.

## Compatibility And Migration

1. Existing application effectors keep working during a bounded transition.
2. A compatibility adapter may wrap a raw `{ type, ...payload }` value as an explicitly registered
   legacy Event; Ontahí must not auto-register arbitrary runtime strings permanently.
3. Typed Event declarations become the preferred source for Reaction `.emit(...)` and Operation
   event effects.
4. The generic `run-effect` escape hatch remains for behavior that is intentionally opaque and
   process-local.
5. Existing Reaction result shapes may add occurrence evidence compatibly before removing ambiguous
   `status: emitted` output.
6. Explorer-specific event descriptors are deprecated only after Core reflection supplies the same
   useful metadata.
7. No current Query, Command, Operation, Interaction, cache invalidation, or Task protocol changes
   merely because Event declarations exist.

## Non-Goals

1. No exactly-once occurrence creation, delivery, or effect-processing claim.
2. No assumption that Kafka, NATS, Redis, PostgreSQL, WebSocket, or one queue defines the semantic
   model.
3. No general event-sourcing architecture or reconstruction of Entity state from Events.
4. No automatic conversion of every mutation, delta, log, progress update, or cache invalidation
   into a domain Event.
5. No replacement of Query observation with an Event stream.
6. No unbounded event-history query language or Selection algebra in the first verticals.
7. No arbitrary JavaScript subscription predicate in durable or remote contracts.
8. No durable `onEach` handler before stable subscription, delivery, policy, retry, and versioning
   semantics exist.
9. No Event-backed Task wait on the ephemeral default runtime.
10. No public provider-specific configuration in Core semantic declarations.
11. No general saga, process manager, or distributed transaction framework.
12. No removal of generic effectors that still serve legitimate opaque-effect use cases.

## Decisions Recorded By This Plan

1. Events are first-class application model declarations, not raw strings or application-owned
   effectors.
2. Event Occurrence and Event Delivery are distinct identities and lifecycles.
3. Typed emission lowers through a built-in interpreter to a configurable Event Runtime.
4. Event Runtime is separate from client/server Runtime Transport.
5. Ontahí provides an honest ephemeral in-memory default and allows stronger adapters.
6. Unit of Work queues emissions until commit; atomic occurrence persistence is adapter-dependent.
7. Domain Events remain explicit and intentional rather than inferred from all mutations.
8. Cache invalidation continues to use semantic mutation evidence, not Event subscriptions.
9. External messages cross policy-aware ingress before becoming Event Occurrences.
10. Durable Event waits depend on declared retention and claim capabilities and come after the base
    occurrence model.
11. Generic effectors remain internal machinery and escape hatches, but applications do not register
    one merely to use first-class Events.
12. Runtime Protocol follows the local semantic proof rather than defining it.
13. The first declaration compatibility identity is an explicit positive integer version matched
    exactly at the runtime boundary. Schema fingerprints, migrations, and cross-version delivery
    remain deferred until a retained runtime supplies evidence for them.
14. Mutation-caused occurrences preserve the existing Applied Mutation Outcome identity chain as
    `{ outcomeId, rootOutcomeId, parentOutcomeId? }`. Operation-caused occurrences preserve the
    current operation scope. Neither envelope serializes commands, runtime resources, callbacks,
    Principals, or provider-private objects.
15. Reaction `delivery` continues to govern scheduling and durable acceptance of the Reaction
    intent. Event Runtime capabilities independently describe occurrence acceptance and subscriber
    delivery; the two lifecycles do not share one delivery claim.
16. `TodoListCompleted` remains an explicit domain Event even though a future opt-in
    `DurableOperationCompleted` or graph-change Event family could expose mechanical lifecycle
    facts. Built-in Events must define aggregation and authorization independently so bulk work does
    not imply one delivery per affected Entity.
17. Event ingress authenticates and normalizes at the provider adapter, then crosses an explicit
    default-deny Event route. Core validates the registered declaration, version, payload, and
    correlation before acceptance and retains provider delivery identity as provenance rather than
    as application correlation.
18. Repeating an accepted external delivery creates a distinct occurrence when the selected Event
    Runtime advertises `deduplication: false`. The stable provider delivery identity makes the
    duplicate observable without implying exactly-once acceptance.

## Open Questions

1. Is declaration compatibility best expressed by one integer version, a schema fingerprint, or a
   separate stable Event ID per breaking version?
2. Does acceptance return a complete Event Occurrence synchronously, or may a durable runtime first
   return a publication acceptance and materialize the occurrence later?
3. Which causal fields belong in every occurrence versus optional Activity evidence?
4. How should an atomic Operation with several nested mutations deduplicate or order emissions?
5. Does application correlation remain arbitrary JSON metadata, or must declarations name indexed
   correlation fields?
6. How should Reaction `delivery` relate to Event Runtime delivery guarantees?
7. What overflow behavior should the default in-memory runtime choose, and where is capacity
   configured?
8. Which subscription policies can be checked at registration, and which must be checked for every
   occurrence?
9. Does a replay create new delivery identities while preserving the original occurrence identity?
10. What minimum cursor contract works across in-memory, database, and broker implementations?
11. Can a transactional outbox share the current Data Graph Unit of Work across every provider, or
    is it necessarily provider-specific?
12. Should a durable Event wait claim an occurrence directly or claim a delivery addressed to a
    stable waiter subscription?
13. How are several eligible waiters handled: broadcast, competing consumers, or a declaration-time
    consumption mode?
14. Which Event Runtime capabilities must be reflected to clients without leaking topology?
15. When is a failed post-commit publication surfaced to the Operation caller, Devtools only, or a
    recovery queue?

## Exit Criteria

- [ ] Event declaration, emission, occurrence, subscription, delivery, policy, and runtime
      capabilities have implementation evidence and durable Atlas definitions.
- [ ] Applications use typed Events without manually registering an `emit-event` effector.
- [ ] The in-memory runtime states and proves its ephemeral guarantees.
- [ ] One stronger runtime proves durable acceptance or delivery without changing semantic authoring.
- [ ] Commit, rollback, publication failure, fan-out, cancellation, replay, and duplicate behavior
      are explicit and tested where supported.
- [ ] Todo emits and consumes one bulk Event end to end while cache invalidation remains independent.
- [x] One authenticated external Event resumes one correlated durable continuation across restart.
- [ ] Devtools explains occurrence and delivery beneath their causal Operation, Command, Reaction,
      or ingress Activity.
- [ ] Runtime Protocol transports only the accepted semantic contracts and advertises lifecycle
      limitations honestly.
- [ ] Deferred event processing, broker adapters, and generalized distribution work are preserved in
      linked follow-up plans rather than silently dropped.

## Closure And Evolution

This plan closes when Verticals A, B, and C establish a first-class Event model, one local runtime,
one browser bridge, causal inspection, and one restart-safe Event-backed continuation. The plan
need not ship every broker adapter or a general event-processing platform.

At closure, keep only concepts with implementation evidence as Atlas knowledge. Candidate APIs and
unanswered options remain in plan history. Plan 154 may proceed to bounded distributed evaluation
once Events provide a transport-independent fact and delivery boundary, even if advanced durable
event processing remains future work.
