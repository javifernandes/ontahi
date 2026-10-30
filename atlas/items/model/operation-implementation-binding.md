---
id: ontahi.model.operation-implementation-binding
kind: concept
title: Operation Implementation Binding
parent: ontahi.model.domain-operation
status: shaping
horizon: next
supports:
  - ontahi.model.domain-operation
  - ontahi.model.operation-invocation
  - ontahi.model.operation-execution-resilience
  - ontahi.model.model-backed-operation-execution
  - ontahi.model.semantic-module
  - ontahi.runtime-capability-model
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - ontahi://plans/163-operation-implementation-bindings-and-variants
  - ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings
  - ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation
  - ontahi://plans/160-semantic-modules-composition-and-system-boundaries
---

An [[ontahi.model.operation-implementation-binding|Operation Implementation Binding]] relates one
stable [[ontahi.model.domain-operation|Domain Operation]] contract to an implementation available in
a concrete application environment.

The contract preserves semantic identity, input, output, failures, authority, and invocation. An
implementation may execute as local code, a model-backed computation, a durable definition, a
remote system, another Ontahí subgraph, or another language/runtime. Binding and selection are
runtime composition concerns rather than caller-authored Operation input.

One binding is the ordinary case. Several registered implementations become useful for technology
migration, feature flags, controlled rollout, A/B testing, fallback, shadow evaluation, or
environment-specific execution. Those policies remain distinct: selection occurs before an
attempt; fallback changes binding after failure; shadow execution must not duplicate effects.

The selected binding is trusted execution context and attributable evidence. Stable binding
identity may be safe to retain while provider model, endpoint, process topology, credentials, and
other adapter details remain protected by disclosure policy.

This concept generalizes existing adapter boundaries without forcing every integration through
Events. A remote Operation binding preserves request/result semantics; Events continue to represent
facts, subscriptions, fan-out, and delivery.
