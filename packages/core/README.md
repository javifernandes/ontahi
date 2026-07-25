# Ontahi Core

`@ontahi/core` contains Ontahi's technology-independent graph, operation, task, runtime, computation, and value primitives.

It also contains the zero-infrastructure in-memory graph and task-run implementations used by local hosts, examples, and tests.

This package is not fully standalone yet. BookOps is still the host application that wires real domain models, runtime adapters, and product-specific policies. The extraction direction is tracked in:

1. [Plan 100: Ontahi Framework Extraction](../../../plans/current/100-ontahi-framework-extraction.md)
2. [Plan 99: Semantic Editorial Workflows](../../../plans/backlog/99-semantic-editorial-workflows.md)

Current docs:

1. [Current Mental Model](./docs/current-mental-model.md) - working explanation of Ontahi core, layer purpose, runtime boundaries, and current frictions
2. [Boundary Schemas](./docs/boundary-schemas.md) - graph-native operation contracts and the narrower role of transport validation adapters
3. [Entity Lifecycle Modules](./docs/entity-lifecycle.md) - current house style for richer domain areas that need entity folders, policy modules, lifecycle transitions, and explicit event outputs

## Application composition

`ontahi(...)` is the application composition root for new applications. It binds storage, optional
task execution, and semantic entities into the runtime and reflected graph consumed by ingress
adapters and Explorer:

```ts
const application = ontahi({
  storage,
  tasks: inProcessTasks(),
  entities: app => ({
    Todo: defineTodo(app),
  }),
});
```

The configured storage remains available as `application.storage`. Provider-specific capabilities
stay typed: in-memory applications expose their dataset for test setup, while persistent providers
do not pretend to offer an in-process dataset.

The entity builder callback is transitional: it gives entity modules access to operation and graph
declaration primitives without requiring a separate public `architecture(...)` root. A future entity
declaration refinement can make that binding fully declarative without changing the application
composition model.

## In-Memory Graph

`createInMemoryDataGraphStorage` is the recommended application binding. It supplies both the full
`DataGraphExecutionRuntime` surface and reflected entity browsing over one live seeded dataset, so
the application configures its default storage once:

```ts
const defaultStorage = createInMemoryDataGraphStorage({
  entities: [TodoEntity],
  dataset,
});

const graph = createDataGraphArchitectureAdapter({ defaultStorage });
```

Queries, relation-root reads, streams, counts, inserts, bulk inserts, upserts, updates, deletes, and
Explorer reads all observe that same state. `createInMemoryDataGraphRuntime` and
`createInMemoryReflectedEntityDataReader` remain available as lower-level building blocks.

The implementation is intentionally process-local. It provides no restart durability, transactions,
indexes, migrations, or database constraints; production adapters own those guarantees.
