# Application data access

Ontahi applications use one semantic data graph whether execution is local, direct to storage, or
transported to an authoritative server. Client code describes the population with a Selection or
Query and the result shape with a View. The configured runtime decides where that program runs.

Ordinary data access does not need an application-specific wrapper endpoint or Domain Operation.
Operations remain the language for named domain behavior: invariants, side effects, capabilities,
authorization requirements, coordination, and durable work.

| Need                                            | Primary Ontahi API   |
| ----------------------------------------------- | -------------------- |
| Choose a set of Entities                        | Selection            |
| Read, order, limit, count, or shape that set    | Query + View         |
| Perform a simple storage mutation               | Command              |
| Link or unlink a declared Relation              | Relationship Command |
| Express named domain behavior or durable intent | Operation            |

Remote Queries and explicitly policy-scoped Relationship Commands are available today. Generic
remote Entity insert, update, upsert, and delete Commands are not, so browser writes of those
shapes against server-only storage still use Operations. That is an explicit alpha limitation
rather than a reason to wrap ordinary reads or structural Relation changes in Operations.

## Compose the server application

The application binds storage and semantic Entities once:

```ts
import { ontahi } from '@ontahi/core/runtime/server';

export const TodoApplication = ontahi({
  storage,
  entities: [TodoList, TodoItem],
});
```

Entity registration makes a definition available to the server runtime and reflection. It does
not grant a remote client access to the Entity.

## Expose an explicit read surface

Remote graph reads are default-deny. Every remotely readable Entity needs a policy that chooses
the permitted modes, cardinalities, limit, fields, operators, ordering, relation traversal, and row
scope:

```ts
import { selection, type GraphReadPolicy } from '@ontahi/core/data-graph';
import type { Principal } from '@ontahi/core/runtime/server';

type TodoReadAuthority = {
  principal: Principal;
};

export const TodoItemReadPolicy = {
  entity: TodoItem,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 200,
  fields: {
    id: { select: true, filter: ['eq', 'in'] },
    ownerId: { filter: ['eq'] },
    title: { select: true, filter: ['eq'], order: true },
    completed: { select: true, filter: ['eq'] },
  },
  scope: ({ authority, entity }) =>
    selection(entity, todo => todo.ownerId.eq(authority.principal.subject)),
} satisfies GraphReadPolicy<typeof TodoItem, TodoReadAuthority>;
```

The server intersects the caller's Selection with the policy scope. A client cannot supply or
weaken that scope. Use `scope: 'all'` only when every row is deliberately public. Missing policies,
fields, operators, relation nodes, or scope are never interpreted as implicit access.

The policy declaration is a public alpha surface and will gain more authoring ergonomics. Its
default-deny meaning and server-side enforcement are architectural contracts.

## Mount Express

The Express adapter mounts Operations and optional graph reads from the same application. One
invocation-context factory supplies trusted request identity to both protocols:

```ts
import { requirePrincipal } from '@ontahi/core/runtime/server';
import { ontahiExpress } from '@ontahi/runtime-express';

server.use(
  ontahiExpress(TodoApplication, {
    invocationContext: request => ({
      principal: authenticate(request),
    }),
    graphRead: {
      policies: [TodoItemReadPolicy],
      authority: context => ({
        principal: requirePrincipal(context.principal),
      }),
    },
  }),
);
```

With the default mount root this exposes `POST /graph/reads` and `POST /operations`. Omitting
`graphRead` means no graph-read route exists. `mountPath` can place all Ontahi routes below one
host-selected prefix.

See [`@ontahi/runtime-express`](../packages/runtime-express/README.md) for custom paths, Explorer,
ingress, and lower-level dispatcher composition.

## Mount Next.js

Next.js uses the same policy dispatcher and trusted invocation context from an App Router Route
Handler:

```ts
import { createNextGraphReadRouteHandler } from '@ontahi/runtime-nextjs/graph-read';

const dispatcher = TodoApplication.createGraphReadDispatcher([TodoItemReadPolicy]);

export const POST = createNextGraphReadRouteHandler({
  dispatcher,
  invocationContext: async request => ({
    principal: await authenticate(request),
  }),
  authority: context => ({
    principal: requirePrincipal(context.principal),
  }),
});
```

The host chooses the route file and therefore its URL. Mount
`createNextOperationInvocationRouteHandler(...)` in the host's Operation route when the client also
invokes Operations; both adapters can derive the same invocation context. Configure the React
Fetch client when either URL differs from the conventional path.

## Generate the browser Entity facade

`@ontahi/codegen` projects browser-safe Entity and exposed Operation declarations from the server
application. With the conventional `src/graph.ts` composition root:

```json
{
  "scripts": {
    "codegen": "ontahi-codegen",
    "codegen:check": "ontahi-codegen --check"
  }
}
```

```sh
pnpm codegen
```

Generated Entity facades retain identities, Relations, Selection authoring, Query entry points, and
the client-visible Operation contract without importing server-only implementations.

## Author Views and Queries in the client

A View is a caller-owned, typed, recursive materialization shape. It is client source, not a server
schema registration:

```ts
import { TodoItem, TodoList } from './generated/client-entities.js';

const TodoListItem = TodoItem.view('TodoListItem', {
  id: true,
  list: true,
  title: true,
  completed: true,
});

const visibleTodos = TodoItem.selection(todo => todo.list.eq(TodoList.refById(selectedListId)));

const todos = TodoItem.all()
  .where(visibleTodos)
  .as(TodoListItem)
  .orderBy(todo => todo.title);
```

A `true` leaf preserves the ordinary field value. For a Ref field that means the Ref remains a Ref.
Use a nested object to traverse a Relation and materialize the related Entity:

```ts
const TripListItem = Trip.view('TripListItem', {
  id: true,
  truck: {
    owner: {
      company: { name: true },
    },
  },
  stops: {
    place: {
      country: { code: true, name: true },
    },
  },
});
```

The server validates the transported View against its canonical Entities, Relations, and read
policy. Ontahi does not recursively hydrate undeclared relation paths.

`select(...)` and `include(...)` remain useful lower-level Query-building APIs. Prefer Views for
named, reusable, caller-owned result shapes, especially when a shape must cross a transport or be
applied to an Operation result.

## Execute Queries from React

The conventional same-origin client requires no endpoint wiring:

```tsx
import { OntahiGraphProvider, useGraphQuery } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <OntahiGraphProvider
    runtime={{ name: 'browser' }}
    identity={{
      principal: session.principal ?? null,
      cacheScope: session.workspaceId,
    }}
  >
    <TodoApp />
  </OntahiGraphProvider>
</QueryClientProvider>;

const rows = useGraphQuery(todos);
const first = useGraphQuery(todos.first());
const one = useGraphQuery(todos.one());
const count = useGraphQuery(todos.count());
const exists = useGraphQuery(todos.exists());
```

Many rows are the default. `first()` may return `null`; `one()` asserts strict cardinality. React
derives the query key from the canonical graph program and partitions it by `ExecutionIdentity`, so
the caller does not repeat a mode or manually maintain the ordinary cache key.

`ExecutionIdentity` describes distributed client state across login, tenant, service, or workspace
changes. It is not a credential. The server always authenticates the native request and derives its
authoritative Principal independently.

The default Fetch client is lazy and uses:

- `/graph/reads` for Queries;
- `/graph/commands` for explicitly permitted Relationship Commands;
- `/operations` for Operations;
- `/operations/tasks` for durable task snapshots;
- `/explorer/entities` for reflected Explorer data.

Customize the bundle when the host uses another mount root:

```tsx
import { createFetchGraphClient } from '@ontahi/react/graph';

const graphClient = createFetchGraphClient({
  graphRead: {
    endpoint: '/runtime/ontahi/graph/reads',
    commandEndpoint: '/runtime/ontahi/graph/commands',
  },
  operations: { mountPath: '/runtime/ontahi' },
  reflectedEntityData: { endpoint: '/runtime/ontahi/explorer/entities' },
});

<OntahiGraphProvider runtime={runtime} client={graphClient} />;
```

Individual provider props can replace one capability. `client={false}` disables all conventional
defaults for a fully explicit host.

## Execute the same fluent Query outside React

The Fetch client also exposes its Effect-based graph runtime. Bind a generated client Entity when
application code needs fluent execution without a React hook:

```ts
import { runBrowserEffect } from '@ontahi/core/runtime/browser';
import { createFetchGraphClient } from '@ontahi/react/graph';
import { TodoItem as GeneratedTodoItem } from './generated/client-entities.js';

const client = createFetchGraphClient();
const TodoItem = client.graph.bindClientEntity(GeneratedTodoItem);
const TodoItemListItem = TodoItem.view('TodoItemListItem', {
  id: true,
  title: true,
  completed: true,
});

const rows = await runBrowserEffect(
  TodoItem.where(todo => todo.completed.eq(false))
    .as(TodoItemListItem)
    .orderBy(todo => todo.title)
    .run(),
);
```

Binding returns a new facade: it preserves the generated Entity's Views, Refs, and Domain
Operations without mutating its portable schema. `createRuntimeBoundDataGraphApi(...)` provides the
same `bindClientEntity(...)` API for direct runtimes. The authored Query therefore stays unchanged
between direct storage and the remote Fetch topology.

## Invoke Operations

Use Operations when the application is asking the domain to do something rather than merely
reading its graph:

```ts
import { useOperation, useOperationQuery } from '@ontahi/react/graph';

const createTodo = useOperation(TodoItem.domain.create);
await createTodo.executeAsync({ id, list, title });

const completeVisible = useOperation(TodoItem.domain.complete({ todos: visibleTodos }));
await completeVisible.executeAsync();
```

Passing the declaration keeps a reusable mutation whose input is supplied to `executeAsync`.
Passing `Entity.domain.operation(input)` creates a first-class bound invocation and execution takes
no argument. Durable Operations use `useDurableOperation` and expose their task lifecycle.

An Operation returning `self.one()` or `self.many()` defines the semantic population. The caller
can choose its View without changing that population:

```ts
const AvailableTrip = Trip.view('AvailableTrip', {
  id: true,
  driver: { name: true },
});

const availableTrips = Trip.domain.available.as(AvailableTrip);
const result = useOperationQuery(availableTrips, input);
```

The runtime combines the Operation's declarative Selection and the caller's View into one final
Query. Complete composition requires the Operation to return that Selection without first
materializing imperative reads.

## Expose structural Relation changes separately

The graph-command bridge carries only canonical Relationship Commands: the Relation identity,
`link` or `unlink`, and Ref- or Selection-valued participants. The server must opt each Relation
and action into a separate default-deny policy:

```ts
ontahiExpress(TodoApplication, {
  graphRead: { policies: todoGraphReadPolicies },
  graphCommand: {
    policies: [{ entity: TodoItem, relationName: 'tags', actions: ['link', 'unlink'] }],
  },
});
```

The server resolves the canonical Relation from its own Entity catalog and applies cardinality,
nullability, participant constraints, graph-command policy, and storage authorization. The client
does not send table names, columns, SQL, executable predicates, or an authority decision.

Relationship Commands return an explicit applied/not-applied result. Applied results carry the
exact added and removed links; an explicitly skipped conditional precondition carries a safe
diagnostic and no delta. Use a Domain Operation instead when the intention coordinates several
mutations, requires secrets or Capabilities, or owns a domain invariant beyond one structural
edge.

## Current alpha boundaries

- Remote Query policies and `ExecutionIdentity` are intentionally public but still evolving
  authoring surfaces.
- Remote Relationship Commands are supported behind an explicit graph-command policy. Generic
  remote Entity Commands remain unsupported; use Operations for those server-only writes without
  assuming every temporary wrapper is permanent domain vocabulary.
- Client Views are ordinary source declarations. Persisted or server-approved View catalogs are a
  separate future concern.
- The conventional Fetch client removes repetitive client setup. It does not mount server routes,
  expose Entities, authenticate requests, or replace authorization policy.

The executable reference is [`examples/todo-express`](../examples/todo-express/README.md). It shows
the full path from Entity declarations and policy through codegen, Express, React Queries,
Operations, policy-scoped tag Relationship Commands, authentication, and both in-memory and
PostgreSQL storage. The canonical long-form guide is
[`Ontahí for Developers`](./developers/README.md); its Relations chapter uses the focused
[`Classroom`](../examples/classroom/README.md) proof for conditional transitions, UnitOfWork,
transactions, Reactions, and Association Entity lifecycle.
