---
id: ontahi.model.domain-operation
kind: concept
title: Domain Operation
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.operation-contracts
  - ontahi.authority-policies
  - ontahi.model.operation-invocation
  - bookops.semantic-editorial-experience
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - bookops://plans/71-ontahi-bookops-semantic-model-convergence
  - bookops://plans/71c-ontahi-application-module-composition
  - bookops://plans/59-authority-scoped-domain-operations-over-the-data-graph
  - bookops://plans/68c-domain-operation-and-transport-api
  - bookops://plans/75-operation-result-contracts
  - bookops://plans/70-first-class-workflow-tier-in-architecture
  - bookops://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/78-first-class-authorization-and-relationship-policies
  - bookops://plans/79-graph-native-schema-dsl
  - bookops://plans/100f-operation-invocation-capability
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/122-ontahi-developer-book
  - bookops://plans/125-ontahi-ai-operations
  - ontahi://plans/74b-schema-native-operation-refs
  - ontahi://plans/142c-reflected-atomic-operation-execution
migratedFrom: bookops://atlas/model/domain-operation
sourceCommit: 67713696
---

A [[ontahi.model.domain-operation|Domain Operation]] is an application action expressed in domain language rather than transport, UI, or database language.

Domain operations connect product intentions, input/result contracts, authorization requirements,
client invocation, server execution, and evidence. They are not mandatory transport wrappers for
ordinary [[ontahi.model.query|Queries]] or [[ontahi.model.command|Commands]].

The operation contract does not require one permanent implementation mode. Runtime composition may
eventually bind the same semantic operation to code, a model, an external system, or a composition,
while immediate, durable, and streamed execution remain independent lifecycle choices. See
[[ontahi.model.model-backed-operation-execution|Model-Backed Operation Execution]].

When an operation concerns existing entities, a [[ontahi.model.selection|Selection]] can describe its target independently from the behavior, cardinality requirements, authority, and effects the operation adds.

An operation whose implementation is entirely a graph read may return that read directly. This
includes ordinary selections and reads rooted through a declared relation; the selected runtime
interprets either form as the operation result.

Large operation families may be authored behind `operationGroup(...)`. An operation group is not a
new domain behavior or runtime container; it is a declaration and compiler boundary that names the
operations exported by an entity without forcing the application root to structurally expand every
implementation type. Runtime composition validates name drift, while codegen analyzes the factory
and preserves target-specific operation contracts.

Entity references are semantically part of an operation's input contract, not an independent kind
of operation metadata. The input tree contains scalar, value, Selection, and Entity Ref nodes;
validation, transport, reflection, codegen, Explorer controls, and server hydration derive from that
single schema. A Ref remains at the declared field path across the bridge and gains explicit runtime
methods only on the server-side copy. There is no parallel authored `inputRefs` bag or implementation
`refs` namespace.

An Operation that coordinates several Data Graph reads and mutations can declare
`operation.atomic({...})`. The portable declaration contains only
`execution.atomicity: 'required'`; Core derives the provider-neutral
`data-graph.atomicity` requirement instead of asking authors to repeat a capability list or name a
provider. The ordinary server runner opens or reuses the runtime's transaction around requirements,
legacy pre-checks, the body, and legacy post-checks. If the authoritative runtime lacks that
capability, execution returns a safe `execution_unavailable` failure before those phases are
evaluated.

Static execution guarantees remain distinct from live execution affordances. Reflection and
generated clients preserve atomicity, while a runtime planner reports whether the current binding
can execute locally, bridge the same Operation invocation to an authority, or cannot execute it.
UI code may explain that result but does not choose a provider or change the invocation API.
