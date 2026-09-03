---
id: ontahi
kind: project
title: Ontahi
status: in-progress
horizon: now
supports:
  - bookops
  - spec-workstream-atlas
relatedPlans:
  - bookops://plans/68-unified-application-architecture-surface
  - ontahi://plans/100-ontahi-framework-extraction
  - ontahi://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/129-ontahi-independent-repository-and-release-readiness
migratedFrom: bookops://atlas/ontahi
sourceCommit: 67713696
---

Ontahi is a framework language for entities, identity, relations, selections, data programs,
operations, runtime boundaries, policies, workflows, and reflective surfaces. BookOps is its first
production host, not part of the framework definition.

The important atlas move is to treat Ontahi as a root project, not merely an implementation detail
under BookOps.

## Achieved Foundation

[`Ontahi Independently Usable`](./independently-usable.md) records the completed independence goal.
Framework extraction, runtime portability, examples, documentation, and open-source readiness were
ways to reach that outcome, not permanent prerequisites attached to every later Ontahi plan.

Internal source extraction, independent distribution, the Todo proof, the first developer book,
and BookOps' exact npm consumer boundary establish that baseline. Portable Data Graph execution,
the Runtime Protocol, language tooling, new adapters, and later semantic work are independent
evolution of Ontahi rather than evidence still required to make it independently usable.

## Primary Shapes

1. [`Ontahi Model`](./model.md)
2. [`Ontahi Source Code Organization`](./source-code-organization.md)
3. [`Application Architecture Surface`](./application-architecture-surface.md)
4. [`Domain Topology And Ontahi Explorer`](./domain-topology-and-graphos.md)
5. [`Operation Contracts`](./operation-contracts.md)
6. [`Graph-Native Schema DSL`](./graph-native-schema-dsl.md)
7. [`Durable Workflows`](./durable-workflows.md)
8. [`Authority And Policies`](./authority-and-policies.md)
9. [`Learning Materials`](./learning-materials.md)
