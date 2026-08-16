---
id: ontahi.model.application
kind: concept
title: Application
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.application-architecture-surface
  - ontahi.independently-usable
relatedPlans:
  - bookops://plans/71c-ontahi-application-module-composition
  - bookops://plans/100h-ontahi-portability-example-and-developer-guide
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/model/application
sourceCommit: 67713696
---

An [[ontahi.model.application|Application]] is the composed Ontahi model with the runtime bindings
needed to interpret it. It gives one root to Entities, Relations, Operations, storage, task
execution, Capabilities, reflection, and generated projections.

```ts
const TodoApplication = ontahi({
  storage,
  entities: [TodoList, TodoItem],
});
```

The Application is not a passive registry and is not the web host. Express, Next.js, a worker, a
CLI, or a test process can mount the same Application through different adapters. Its graph exposes
bound Entities and their portable semantic programs; its runtime decides how those programs
execute in that environment.

Application composition prepares the complete Entity catalog before binding operations. That makes
nominal/cyclic references, conventional storage mappings, reflection, codegen, and operation
discovery consequences of one model instead of independently assembled registries.
