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
  - ontahi://plans/100f-operation-invocation-capability
  - ontahi://plans/125-ontahi-ai-operations
  - ontahi://plans/153-model-backed-todo-command-spike
  - ontahi://plans/153a-model-execution-security-and-authorization
  - ontahi://plans/153b-declarative-operation-context-scope
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

## First Bounded Proof

Plan 153 shapes a typed interpreter operation whose model-backed implementation produces a
proposed invocation for the Todo application. [[ontahi.model.intent-resolution|Intent Resolution]]
is its domain behavior; model-backed execution is its implementation mode. The authoritative
mutation remains a separate invocation of an existing Todo operation through the canonical runtime.

Context assembly initially runs in code from typed inputs and authorized graph reads. It projects
relevant schema, available operation contracts, and bounded instance data. A future declarative
scope may describe which graph region is relevant; it cannot expand authority. Plan 153b owns that
investigation after the manual context provides evidence.

A replaceable model-provider binding handles model interaction. Context fetching, output contract
validation, allowed-operation enforcement, and dispatch remain Ontahi/application responsibilities.
Provider message and tool-call formats must not become a second operation language. The spike
starts with a local Ollama adapter and leaves broader provider integrations and public API shape open.

Strong authorization coupling and prompt-injection protection remain required follow-up work in
plan 153a before broader deployment. Existing authorization is mandatory in the spike; neither
prompt instructions nor validated output are a security boundary by themselves.

The local Todo spike now supplies initial implementation evidence through an example-owned runtime
capability: the caller invokes `TodoList.interpretCommand`, while composition supplies the model
provider and context builder. A code-backed replacement is exercised under the same operation
contract. This does not yet establish a generic Core executor-binding API. The first real-model
trial also distinguishes contract validity from semantic quality: a valid, permitted proposal can
still resolve the wrong human intention. Evaluation remains independent from schema validation.
