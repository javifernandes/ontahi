# 163. Operation Implementation Bindings And Variants

Status: research

Canonical ID: `ontahi://plans/163-operation-implementation-bindings-and-variants`

Shapes: [Operation Implementation Binding](../../atlas/items/model/operation-implementation-binding.md),
[Domain Operation](../../atlas/items/model/domain-operation.md).

Related plans:

1. [162. Operation Execution Resilience](../current/162-operation-execution-resilience.md)
2. [120. Environment Resources And Semantic Bindings](../next/120-ontahi-environment-resources-and-semantic-bindings.md)
3. [125a. Model Execution Resource Governance](../current/125a-model-execution-resource-governance.md)
4. [154. Semantic Program Kernel And Distributed Evaluation](154-semantic-program-kernel-and-distributed-evaluation.md)
5. [160. Semantic Modules, Composition, And System Boundaries](160-semantic-modules-composition-and-system-boundaries.md)

## Summary

Investigate a first-class binding between one Domain Operation contract and one of several possible
implementations: local code, a model, a remote runtime, a durable execution definition, or another
language/runtime. Preserve one invocation API, authority boundary, input/output contract, failure
vocabulary, and semantic identity while runtime composition selects the implementation.

The immediate evidence is an analysis Operation that can run through a deterministic heuristic or
a provider-neutral model. Environment-time selection already works through optional capabilities,
but the choice is implicit in application code and is not reflected, governed, or attributable.

## Core Distinctions

1. **Contract** says what Operation the caller requests.
2. **Implementation** says how one runtime can attempt that contract.
3. **Binding** relates the contract to an implementation in an environment.
4. **Selection policy** chooses a binding before an attempt.
5. **Fallback policy** may choose another binding after a failed attempt.
6. **Rollout policy** distributes invocations across bindings for feature flags or experiments.

Selection, fallback, shadow execution, migration, and A/B testing must not collapse into one
unexplained dispatcher. The selected binding is trusted execution context and evidence, never an
authority supplied by an untrusted caller.

## Questions To Resolve

1. Does an Operation declare implementation slots, or does environment composition bind them
   externally to keep the semantic program portable?
2. Which implementation requirements are reflected capabilities rather than provider names?
3. Is selection static per application, scoped per tenant/session, or decided per invocation?
4. How does a narrower module or host policy restrict but never widen available bindings?
5. Which binding identity is safe for diagnostics, audit, reproducibility, and client disclosure?
6. Can a fallback preserve one invocation while keeping attempts, costs, and effects distinct?
7. How are compatible implementations supplied from TypeScript, Rust, a remote subgraph, or a
   model provider without making TypeScript factories the semantic format?

## Provisional Shape

Explanatory only:

```ts
operation({
  id: 'RecallAnalysis.analyze',
  input: AnalyzeRecallInput,
  output: AnalyzeRecallOutput,
  failures: AnalyzeRecallFailures,
});

bindings({
  'RecallAnalysis.analyze': {
    local: codeImplementation(...),
    model: modelImplementation(...),
  },
});

selectImplementation({
  operation: 'RecallAnalysis.analyze',
  binding: environment.MODEL_ENABLED ? 'model' : 'local',
});
```

The final design may place the binding registry in Application composition, a Semantic Module, or
an environment artifact. It must not require simultaneous implementations when an application only
wants to replace one implementation during migration.

## Relationship To Existing Runtime Adapters

LangGraph already proves that the same explicit Task execution definition can run through native
or LangGraph runtimes without changing the public Operation or Runtime Protocol. Data Graph storage
adapters similarly implement one semantic contract with different technologies. This plan extends
that principle from infrastructure services to the body of a particular Domain Operation.

External systems and distributed Ontahí subgraphs are valid bindings. A remote binding may use RPC,
HTTP, a queue, or another runtime bridge internally while preserving the same semantic invocation.
Events remain appropriate for facts and fan-out; they are not forced into request/result behavior
merely to cross a runtime boundary.

## Relationship To Resilience And Governance

Resilience repeats an attempt; selection chooses what will implement it. Fallback combines both but
must remain explicit. Resource Governance may deny a binding or one of its attempts based on
capacity, disclosure, or budgets, but it does not grant Operation authority.

Each attempt evidence should identify the effective binding at an appropriate disclosure level.
Model provider/model identity, remote endpoint, process topology, and language runtime remain more
sensitive adapter details than the stable binding identity.

## Research Proof

Use one structured analysis contract with:

1. a deterministic local implementation;
2. a provider-neutral model-backed implementation;
3. identical input, output, validation, and invocation surfaces;
4. host-selected binding without `if (provider)` inside the Operation body;
5. evidence showing the selected binding and attempts;
6. a later replacement proof in which the caller and persisted domain schema do not change.

Then compare a remote or alternate-runtime implementation to ensure the abstraction is not merely
a feature flag around two TypeScript functions.

## Acceptance Criteria For Research

- [ ] Contract, implementation, binding, selection, and fallback have non-overlapping meanings.
- [ ] Callers cannot select a privileged binding through ordinary Operation input.
- [ ] A single implementation remains the simple/default authoring case.
- [ ] Code-backed and model-backed implementations satisfy the same validation contract.
- [ ] Selection is attributable through execution context and evidence.
- [ ] Feature flags and A/B tools can adapt to the semantic selector without becoming Core.
- [ ] Remote and multi-language implementations fit without changing Operation identity.
- [ ] The design composes with Modules, resilience, authorization, and Resource Governance.

## Non-Goals

1. Do not build a feature-flag product or experiment analytics engine.
2. Do not run implementations simultaneously by default.
3. Do not make silent fallback the default failure behavior.
4. Do not expose credentials, provider URLs, or deployment topology in the semantic contract.
5. Do not require model-backed Operations to return provider metadata as business output.
