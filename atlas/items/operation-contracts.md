---
id: ontahi.operation-contracts
kind: system-primitive
title: Operation Contracts
parent: ontahi
status: active
horizon: now
supports:
  - ontahi
  - bookops
  - bookops.semantic-editorial-experience
relatedPlans:
  - ontahi://plans/142-declarative-model-semantics-and-execution-planning
  - ontahi://plans/142a-existing-operation-contract-compatibility-baseline
  - ontahi://plans/142e-portable-operation-condition-bridge
migratedFrom: bookops://atlas/operation-contracts
sourceCommit: 67713696
---

Operation Contracts cover inputs, results, validation, operation invocation, and the way UI,
server, and LLM agents can talk about executable work. Their shapes are authored through the
top-level [[ontahi.graph-native-schema-dsl|Graph-Native Schema DSL]], but the language is not owned
by Operation Contracts.

Plan 142e replaced callback-valued top-level contracts during the alpha. `contracts.pre` now owns
an object of named portable input conditions. Codegen analyzes their natural TypeScript expressions
without executing them and emits versioned Model Expression IR. The canonical runtime metadata
contains a stable id, dependencies, and conventional rejection; it is reflected and shared with
generated clients. Advisory evaluation may be satisfied, rejected, or unknown, and never removes
authoritative evaluation before the body.

The first portable subset compares Operation input Ref identities. It does not yet include
stateful preconditions, portable postconditions, derived Fields, or permanent invariants. Those
categories share expression vocabulary only after their different read, transaction, and mutation
lifecycle guarantees are proven.

Arbitrary server-only checks remain available through the explicit `contract(...)` Layer Concern.
Its pre/post callbacks may be synchronous, Promise-valued, or Effect-valued and may produce
`OperationFailure` values. They remain intentionally opaque to reflection and clients. In an
ordinary Operation an opaque post failure does not undo body effects; in `operation.atomic(...)`,
requirements, portable preconditions, and opaque pre/body/post checks execute inside the same Data
Graph transaction and can roll it back.

## Child Items

1. [`Operation Inputs`](./operation-contracts/operation-inputs.md)
2. [`Operation Results`](./operation-contracts/operation-results.md)
