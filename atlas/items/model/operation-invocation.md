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
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - bookops://plans/75b-canonical-operation-invocation-results
  - bookops://plans/100f-operation-invocation-capability
  - bookops://plans/122-ontahi-developer-book
  - bookops://plans/120-ontahi-environment-resources-and-semantic-bindings
  - bookops://plans/90-event-driven-architecture-runtime
  - bookops://plans/125-ontahi-ai-operations
migratedFrom: bookops://atlas/model/operation-invocation
sourceCommit: 67713696
---

An [[ontahi.model.operation-invocation|Operation Invocation]] is a semantic message requesting that an Ontahi operation be interpreted.

The invocation carries an operation identity and opaque input independently from Fetch, Next.js, Express, webhooks, queues, CLI commands, workflows, or future transports. A canonical dispatcher resolves the operation and applies input validation, authority, execution, and result semantics before delegating to an implementation such as code, an LLM, an external system, or a durable runtime.

Operation invocations are requests or intentions and may produce a canonical result. They remain distinct from events, which state facts and may support fan-out or replay without one request/result relationship.

HTTP ingress makes that boundary executable: a provider can authenticate and normalize an external
event into a typed channel, and reflected ingress metadata can map that channel to an operation
invocation. The channel behaves like a narrow subscription, but the mapping does not turn the event
itself into an invocation. This is evidence for a future event model that can compose graph-produced
and third-party events while preserving their different delivery and result semantics.

Application code ordinarily invokes an operation through its bound entity, such as
`TodoList.list()` or `TodoList.rename({ list, name })`. The bound method applies the operation
lifecycle and returns an [[ontahi.operation-contracts.operation-results|Operation Invocation Result]].

The server application facade exposes the same concept as `app.operation.invoke(...)` for dynamic
dispatch and runtime integration. HTTP, framework, and workflow bridges dispatch this same
invocation instead of selecting a transport-specific execution contract.

Framework internals may use `app.operation.runRaw(...)` when they intentionally need the lower-level runtime envelope. The explicit name keeps that representation available without making it the default application-facing contract.
