# Ontahi Core

`@ontahi/core` contains Ontahi's technology-independent graph, operation, task, runtime, computation, and value primitives.

It also contains the zero-infrastructure in-memory graph and task-run implementations used by local hosts, examples, and tests.

This package is source-independent from BookOps, which remains the first production host. Ontahi's
packages are not yet independently published or validated as registry artifacts. The completed
source extraction and the current distribution study are tracked in:

1. [Plan 100: Ontahi Framework Extraction](../../../plans/done/100-ontahi-framework-extraction.md)
2. [Plan 129: Independent Repository And Release Readiness](../../../plans/research/129-ontahi-independent-repository-and-release-readiness.md)

Current docs:

1. [Historical Core Mental Model](./docs/current-mental-model.md) - computational and layer vocabulary retained from the extraction path
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
  entities: [TodoList, TodoItem],
});
```

The configured storage remains available as `application.storage`. Provider-specific capabilities
stay typed: in-memory applications expose their dataset for test setup, while persistent providers
do not pretend to offer an in-process dataset.

## In-Memory Graph

`createInMemoryDataGraphStorage` is the recommended application binding. It supplies both the full
`DataGraphExecutionRuntime` surface and reflected entity browsing over one live seeded dataset, so
the application configures its default storage once:

```ts
const storage = createInMemoryDataGraphStorage();

const application = ontahi({
  storage,
  entities: [TodoList, TodoItem],
});
```

Queries, relation-root reads, streams, counts, inserts, bulk inserts, upserts, updates, deletes, and
Explorer reads all observe that same state. `createInMemoryDataGraphRuntime` and
`createInMemoryReflectedEntityDataReader` remain available as lower-level building blocks.

The implementation is intentionally process-local. It provides no restart durability, transactions,
indexes, migrations, or database constraints; production adapters own those guarantees.
