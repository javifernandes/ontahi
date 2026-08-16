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
of operation metadata. The current `input` plus `inputRefs` authoring split is transitional:
`inputRefs` claims scalar locator fields from the runtime schema, normalizes public refs onto those
wire fields, and hydrates resolvers for the operation implementation. Reflection must expose the
semantic ref only, never both the ref and its claimed scalar backing fields. The target authoring
surface is one input tree containing scalar, value, selection, and entity-ref nodes; Ontahi should
derive validation, wire lowering, reflection, codegen, and hydrated `refs` from that single tree.
