---
id: ontahi.application-architecture-surface
kind: territory
title: Application Architecture Surface
parent: ontahi
status: shaping
horizon: now
supports:
  - ontahi
  - bookops
relatedPlans:
  - bookops://plans/71-ontahi-bookops-semantic-model-convergence
  - bookops://plans/68-unified-application-architecture-surface
  - bookops://plans/68k-graph-native-application-composition-model
  - bookops://plans/68a-architecture-factory-and-app-facade
  - bookops://plans/architecture-facade-completion
  - bookops://plans/100e-ontahi-runtime-capabilities-and-repository-topology
migratedFrom: bookops://atlas/application-architecture-surface
sourceCommit: 67713696
---

Application Architecture Surface covers how an Ontahi graph becomes a configured application: host composition, capability ports, technology adapters, policies, runtime setup, and the app-facing API.

The current `architecture()`, `layer`, and `concern` vocabulary predates the graph-native language and remains provisional. The durable distinction is clearer than the final names: graph declarations express application meaning; host composition binds that meaning to runtime capabilities and adapters; a configured app surface exposes execution to server, clients, ingress, tasks, and Explorer.

## Child Shapes

1. [`React Graph Surface`](./react-graph-surface.md)
2. [`Runtime Capability Model`](./application-architecture-surface/runtime-capabilities.md)
3. [`Runtime Data Reflection`](./application-architecture-surface/runtime-data-reflection.md)
4. [`Alive UI`](./application-architecture-surface/alive-ui.md)
5. [`Storage Schema Contract Validation`](./application-architecture-surface/storage-schema-contract-validation.md)
6. [`Data Graph Execution Routing`](./application-architecture-surface/data-graph-execution-routing.md)
7. [`Authentication And Principal`](./application-architecture-surface/authentication-and-principal.md)
8. [`Ontahí Runtime Protocol`](./application-architecture-surface/runtime-protocol.md)
