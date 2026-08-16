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
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - bookops://plans/122-ontahi-developer-book
  - bookops://plans/129-ontahi-independent-repository-and-release-readiness
migratedFrom: bookops://atlas/ontahi
sourceCommit: 67713696
---

Ontahi is a framework language for entities, identity, relations, selections, data programs,
operations, runtime boundaries, policies, workflows, and reflective surfaces. BookOps is its first
production host, not part of the framework definition.

The important atlas move is to treat Ontahi as a root project, not merely an implementation detail
under BookOps.

## Strategic Goal

[`Ontahi Independently Usable`](./independently-usable.md) describes the desired outcome. Framework
extraction, runtime portability, examples, documentation, and open-source readiness are ways to
advance that Goal, not the Goal itself.

Internal source extraction, independent distribution, the Todo proof, the first developer book, and
BookOps' exact npm consumer boundary are complete through `0.1.0-alpha.3`. The next semantic
evidence is portable Data Graph execution across process boundaries, beginning with policy-bounded
remote reads rather than wrapper Operations.

## Primary Shapes

1. [`Ontahi Model`](./model.md)
2. [`Ontahi Source Code Organization`](./source-code-organization.md)
3. [`Application Architecture Surface`](./application-architecture-surface.md)
4. [`Domain Topology And Ontahi Explorer`](./domain-topology-and-graphos.md)
5. [`Operation Contracts`](./operation-contracts.md)
6. [`Durable Workflows`](./durable-workflows.md)
7. [`Authority And Policies`](./authority-and-policies.md)
8. [`Learning Materials`](./learning-materials.md)
