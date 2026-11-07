---
id: ontahi.model.operation-invocation
kind: concept
title: Operation Invocation
parent: ontahi.model.domain-operation
status: active
horizon: now
supports:
  - ontahi.model.domain-operation
  - ontahi.operation-contracts
  - ontahi.runtime-capability-model
  - ontahi.independently-usable
  - ontahi.model.operation-execution-resilience
  - ontahi.model.operation-implementation-binding
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - bookops://plans/75b-canonical-operation-invocation-results
  - ontahi://plans/100f-operation-invocation-capability
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings
  - bookops://plans/90-event-driven-architecture-runtime
  - ontahi://plans/125-ontahi-ai-operations
  - ontahi://plans/162-operation-execution-resilience
  - ontahi://plans/163-operation-implementation-bindings-and-variants
  - ontahi://plans/166-semantic-operation-receivers-and-bound-invocation
migratedFrom: bookops://atlas/model/operation-invocation
sourceCommit: 67713696
---

An [[ontahi.model.operation-invocation|Operation Invocation]] is a semantic message requesting that an Ontahi operation be interpreted.

Plan 166 investigates a typed semantic receiver while preserving one transport-independent
invocation. Repository evidence now favors receiver binding as partial application of a
distinguished input position: Entity Ref and Selection receivers lower into validated input, while
the Entity-qualified Operation identity can supply a declared type receiver. Namespace ownership
alone does not imply receiver mode. That form can preserve the current invocation request —
`kind: 'invoke'`, Operation identity, input, and optional result View — instead of duplicating
receiver identity in a parallel wire field. Forwarding preserves the View so the dispatcher
applies the caller's requested projection without giving it receiver meaning. Reflection and remote
runtimes would still need portable receiver-kind and receiver-position metadata. The
receiver remains distinct from Principal, ambient Invocation Context, implementation binding, and
Resource scope.

The protocol and authority inventory found no current guarantee that requires a second receiver
field. A receiver-aware frontend closes an invocation by binding the declared receiver position,
then sends the existing `{ kind: 'invoke', operationId, input?, view? }` request. Its versioned
Runtime Protocol body adds `version: 1`. The receiving runtime resolves compatible Operation
metadata, validates the complete input once, derives the effective receiver from the descriptor
plus validated input, and applies any requested View independently. Client-supplied receiver
metadata cannot grant authority, choose a privileged placement, or select a Resource binding. A
remote runtime needs the versioned receiver descriptor in the semantic program, not a duplicate
value on every request; it must fail closed when that meaning or its required guarantees are
unavailable.

Receiver binding and a closed invocation are different values. A bound Operation callable accepts
the remaining arguments and injects its Ref, Selection, type, or relation source into the declared
position. A closed invocation already contains complete input and can be sent or executed. Server
facades, generated clients, React hooks, CLI session conveniences, Explorer, and model proposals
should project one of those forms and always lower to the same closed invocation; full explicit
input remains the permanent functional and interoperability API.

The invocation carries an operation identity and opaque input independently from Fetch, Next.js, Express, webhooks, queues, CLI commands, workflows, or future transports. A canonical dispatcher resolves the operation and applies input validation, authority, execution, and result semantics before delegating to an implementation such as code, an LLM, an external system, or a durable runtime.

Operation invocations are requests or intentions and may produce a canonical result. They remain distinct from events, which state facts and may support fan-out or replay without one request/result relationship.

An invocation may contain several execution attempts without becoming several invocations. Runtime
composition selects an Operation implementation binding, and an explicit resilience policy may
request another attempt after a typed failure. Attempt, binding, retry, fallback, redrive, replay,
and request identity remain observable and non-interchangeable.

HTTP ingress makes that boundary executable: a provider can authenticate and normalize an external
event into a typed channel, and reflected ingress metadata can map that channel to an operation
invocation. The channel behaves like a narrow subscription, but the mapping does not turn the event
itself into an invocation. This is evidence for a future event model that can compose graph-produced
and third-party events while preserving their different delivery and result semantics.

The current invocation request carries operation identity, input, and an optional result View, but
not stable request or delivery identity. HTTP ingress currently returns a provider `deliveryId` to
the caller without propagating it through the dispatcher. Consumers must therefore not infer
deduplication or replay safety from the invocation protocol yet; plan 132 defines that missing
boundary together with durable idempotency semantics.

Application code ordinarily invokes an operation through its bound entity, such as
`TodoList.list()` or `TodoList.rename({ list, name })`. The bound method applies the operation
lifecycle and returns an [[ontahi.operation-contracts.operation-results|Operation Invocation Result]].

The server application facade exposes the same concept as `app.operation.invoke(...)` for dynamic
dispatch and runtime integration. HTTP, framework, and workflow bridges dispatch this same
invocation instead of selecting a transport-specific execution contract.

Framework internals may use `app.operation.runRaw(...)` when they intentionally need the lower-level runtime envelope. The explicit name keeps that representation available without making it the default application-facing contract.
