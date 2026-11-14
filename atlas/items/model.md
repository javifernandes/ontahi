---
id: ontahi.model
kind: model
title: Ontahi Model
parent: ontahi
status: active
horizon: now
supports:
  - ontahi
  - bookops.model
relatedPlans:
  - ontahi://plans/71-ontahi-bookops-semantic-model-convergence
  - ontahi://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/78-first-class-authorization-and-relationship-policies
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/168-atlas-semantic-item-type-reconciliation
migratedFrom: bookops://atlas/model
sourceCommit: 67713696
---

Ontahi Model names the framework language independently from BookOps. Its core separates semantic
things, identity, membership, data programs, application behavior, and execution topology instead
of collapsing them into transport endpoints or provider APIs.

## Item typing

Atlas Item metadata keeps three concerns distinct:

1. `kind` describes the durable document shape, such as `concept`, rather than the runtime thing it
   explains.
2. `typeOf` names the most specific semantic Item type or specialization established by the
   concept.
3. broader membership follows that type chain. For example, Durable Operation is directly a Domain
   Operation, while Domain Operation is directly an Atlas Operation; Durable Operation therefore
   inherits Atlas Operation meaning without repeating it.

Placement under another Item expresses navigation and ownership, not semantic typing. A concept
living below Domain Operation is not automatically an executable Operation: invocation, binding,
resilience, and interaction concepts keep their own meaning until evidence supports a narrower
type.

The first developer book and executable Todo application are now the canonical narrative and
pressure test for this model. Atlas preserves the durable distinctions as APIs continue to evolve.

## Child Items

1. [`Application`](./model/application.md)
2. [`Entity`](./model/entity.md)
3. [`Field`](./model/field.md)
4. [`Model Expression`](./model/model-expression.md)
5. [`Identity And Locator`](./model/identity-and-locator.md)
6. [`Ref`](./model/ref.md)
7. [`Relation`](./model/relation.md)
8. [`View`](./model/view.md)
9. [`Value`](./model/value.md)
10. [`Selection`](./model/selection.md)
11. [`Query`](./model/query.md)
12. [`Command`](./model/command.md)
13. [`Domain Operation`](./model/domain-operation.md)
14. [`Operation Invocation`](./model/operation-invocation.md)
15. [`Durable Operation`](./model/durable-operation.md)
16. [`Authority`](./model/authority.md)
17. [`Model-Backed Operation Execution`](./model/model-backed-operation-execution.md) (shaping)
18. [`Intent Resolution`](./model/intent-resolution.md) (shaping)
19. [`Operation Interaction`](./model/operation-interaction.md) (shaping)
20. [`Semantic Program Kernel`](./model/semantic-program-kernel.md) (shaping)
21. [`Semantic Subjects And Runtime Concerns`](./model/semantic-subjects-and-runtime-concerns.md)
    (shaping)
22. [`Semantic Module`](./model/semantic-module.md) (shaping)
23. [`Operation Execution Resilience`](./model/operation-execution-resilience.md) (shaping)
24. [`Operation Implementation Binding`](./model/operation-implementation-binding.md) (shaping)

## Adjacent Runtime Shapes

1. [`Operation Contracts`](./operation-contracts.md) declare admissible input, output, failure, and
   lifecycle meaning.
2. [`Runtime Capability Model`](./application-architecture-surface/runtime-capabilities.md)
   interprets the Application in a concrete environment.
3. [`Data Graph Execution Routing`](./application-architecture-surface/data-graph-execution-routing.md)
   chooses direct or remote execution without changing Query and Command vocabulary.
4. [`Ontahi Source Code Organization`](./source-code-organization.md) owns packages, adapters,
   projections, and independent distribution.
