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
  - bookops://plans/71-ontahi-bookops-semantic-model-convergence
  - bookops://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/78-first-class-authorization-and-relationship-policies
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/122-ontahi-developer-book
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
migratedFrom: bookops://atlas/model
sourceCommit: 67713696
---

Ontahi Model names the framework language independently from BookOps. Its core separates semantic
things, identity, membership, data programs, application behavior, and execution topology instead
of collapsing them into transport endpoints or provider APIs.

The first developer book and executable Todo application are now the canonical narrative and
pressure test for this model. Atlas preserves the durable distinctions as APIs continue to evolve.

## Child Items

1. [`Application`](./model/application.md)
2. [`Entity`](./model/entity.md)
3. [`Field`](./model/field.md)
4. [`Identity And Locator`](./model/identity-and-locator.md)
5. [`Ref`](./model/ref.md)
6. [`Relation`](./model/relation.md)
7. [`View`](./model/view.md)
8. [`Value`](./model/value.md)
9. [`Selection`](./model/selection.md)
10. [`Query`](./model/query.md)
11. [`Command`](./model/command.md)
12. [`Domain Operation`](./model/domain-operation.md)
13. [`Operation Invocation`](./model/operation-invocation.md)
14. [`Durable Operation`](./model/durable-operation.md)
15. [`Authority`](./model/authority.md)

## Adjacent Runtime Shapes

1. [`Operation Contracts`](./operation-contracts.md) declare admissible input, output, failure, and
   lifecycle meaning.
2. [`Runtime Capability Model`](./application-architecture-surface/runtime-capabilities.md)
   interprets the Application in a concrete environment.
3. [`Data Graph Execution Routing`](./application-architecture-surface/data-graph-execution-routing.md)
   chooses direct or remote execution without changing Query and Command vocabulary.
4. [`Ontahi Source Code Organization`](./source-code-organization.md) owns packages, adapters,
   projections, and independent distribution.
