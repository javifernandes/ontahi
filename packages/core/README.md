# Ontahi Core

`@ontahi/core` contains Ontahi's technology-independent graph, operation, task, runtime, computation, and value primitives.

It also contains the zero-infrastructure in-memory graph and task-run implementations used by local hosts, examples, and tests.

The package is source-independent from every host application and is published as a validated
registry artifact with the rest of the lockstep `@ontahi/*` package set.

Current docs:

1. [Historical Core Mental Model](./docs/current-mental-model.md) - computational and layer vocabulary retained from Ontahi's early architecture
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

## Registered Views

Caller-owned recursive Views become part of an application's public graph model by registering them
on `defineGraphApi`:

```ts
const TripList = Trip.view('TripList', {
  id: true,
  driver: { name: true },
});

const graph = defineGraphApi({
  entities: { Trip, Driver },
  views: { TripList },
});
```

`entities` and `views` are separate typed inputs because they play different execution roles, but
their names share one application namespace with named Operation Values. `graph.listViews()`,
`graph.getView(name)`, and `graph.describe().views` expose the registered Views without changing
their canonical identity. Distinct Entity or View declarations cannot claim the same name.

Registering a View also makes it reachable by client codegen. The generated browser module exports
the browser-safe View, so callers can pass it to Query, Selection, or projectable Operation
`.as(view)` APIs without importing the server declaration.

## Authentication Principal

Hosts authenticate their native request and enter Ontahi with a provider-neutral Principal. The
runtime scope works the same way without HTTP:

```ts
await application.app.runtime.withInvocationContext({ principal }, () =>
  TodoItem.complete({ todos: ['todo-123'] }),
);
```

Operations can declare `requires: [app.require.authenticated()]`; their implementation can read
`app.auth.currentPrincipal()` or yield `app.auth.requirePrincipal()`. `null` means unauthenticated.
Provider sessions, OAuth tokens, claims, and user profiles remain host resources rather than part
of the canonical Principal.

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
