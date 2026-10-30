---
id: ontahi.model.operation-execution-resilience
kind: concept
title: Operation Execution Resilience
parent: ontahi.model.domain-operation
status: shaping
horizon: next
supports:
  - ontahi.model.domain-operation
  - ontahi.model.operation-invocation
  - ontahi.model.durable-operation
  - ontahi.model.model-backed-operation-execution
  - ontahi.durable-workflows
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - ontahi://plans/162-operation-execution-resilience
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - ontahi://plans/125a-model-execution-resource-governance
  - ontahi://plans/158-semantic-execution-context-governance-and-evidence
---

[[ontahi.model.operation-execution-resilience|Operation Execution Resilience]] is the optional
semantic policy governing whether and when one
[[ontahi.model.operation-invocation|Operation Invocation]] receives another execution attempt after
a typed failure.

An invocation and an attempt are different identities. Retry preserves the invocation, input,
authority scope, contract, and causal context while assigning another attempt identity. Every
attempt crosses applicable authorization, capability, and Resource-admission boundaries and
produces its own evidence. Retry eligibility never grants authority or capacity.

The policy may describe bounded attempts, retryable semantic failures, delay, backoff, jitter, and
cancellation. It does not imply idempotency, exactly-once effects, compensation, fallback, replay,
resume, or redrive. Failures after an external effect may have committed are ambiguous until an
implementation supplies idempotency, reconciliation, or operation-owned compensation.

Immediate and durable runtimes can interpret the same declaration with different guarantees. An
immediate runtime may delay only while its process and invocation survive. A durable runtime may
persist attempt state and scheduling. LangGraph, Temporal, Step Functions, Vercel Workflow, and
other engines are adapters for that execution meaning; their provider task or state types do not
become Ontahí's model.

Resilience relates to [[ontahi.model.operation-implementation-binding|Operation Implementation
Binding]] without collapsing into it. Retry repeats a selected implementation. Fallback explicitly
selects another implementation after failure and requires separate policy and evidence.
