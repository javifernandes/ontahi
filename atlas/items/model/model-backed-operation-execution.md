---
id: ontahi.model.model-backed-operation-execution
kind: concept
title: Model-Backed Operation Execution
parent: ontahi.model.domain-operation
status: shaping
horizon: next
supports:
  - ontahi.model.domain-operation
  - ontahi.model.operation-invocation
  - ontahi.runtime-capability-model
  - bookops.semantic-editorial-experience
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - bookops://plans/99-semantic-editorial-workflows
  - bookops://plans/100f-operation-invocation-capability
  - bookops://plans/125-ontahi-ai-operations
migratedFrom: bookops://atlas/model/model-backed-operation-execution
sourceCommit: 67713696
---

[[ontahi.model.model-backed-operation-execution|Model-Backed Operation Execution]] lets a model
interpret an existing [[ontahi.model.domain-operation|Domain Operation]] contract without creating a
parallel AI command layer. The operation keeps its identity, typed input and output, authority,
contracts, and canonical invocation result while runtime composition selects a model-backed
executor instead of, or together with, ordinary code.

This is a native execution mode, not an overlay on the application. A caller invokes the same
semantic operation whether its current implementation is code, a model, an external system, or a
composition. Implementation mode must remain separate from execution lifecycle: any implementation
may be immediate, durable, or streamed.

Natural-language intent resolution is adjacent but distinct. Text or voice may resolve into a
typed [[ontahi.model.operation-invocation|Operation Invocation]], or an editorial agent may propose
a reviewable batch of invocations. Once resolved, the canonical dispatcher should apply the same
validation, authority, policy, routing, and result semantics as a call authored directly in code.

A model executor needs reflected declarations for allowed graph sources, tools, output validation,
budgets, trace and citation requirements, evaluation policy, and approval boundaries. Long-running
agents may also receive private runtime resources such as a filesystem, object store, memory, or
resumable workspace. Those resources have explicit scope and lifecycle; they are not authoritative
Entity state.

The design may support a progression from a soft semantic contract, through a prompt-backed
implementation, toward a hardened implementation with stronger evidence or deterministic code.
That progression describes implementation maturity, not whether the operation is durable.
