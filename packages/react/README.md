# @ontahi/react

Non-visual React integration for Ontahi applications.

This package depends on `@ontahi/core`. It owns React hooks and bridge adapters that are generic to React clients:

1. `@ontahi/react/actions`: action execution hooks, React Query integration, and operation bridge adapters.
2. `@ontahi/react/graph`: graph runtime provider, Query and Command hooks, Fetch graph-read execution,
   client cache hooks, and operation bridge adapter lookup hooks.

The generic action metadata and result protocol comes from `@ontahi/core/runtime/actions`; Next.js-specific transport remains in `@ontahi/runtime-nextjs`.

Application-specific graph declarations, domain entities, runtime assembly, and policy stay in the
host application. Reusable reflective UI lives in `@ontahi/explorer-react`; hosts contribute their
own routes, access control, theme/auth composition, and application-specific UI enrichments.

Start with the end-to-end [Application Data Access](../../docs/application-data-access.md) guide for
the recommended server, codegen, and React composition. The canonical
[browser projection chapter](../../docs/developers/04-reflection-and-clients/02-browser-client-and-projection.md)
adds the model context; this README is the package-level reference.

Projectable Operations keep population on the server and shape in the caller:

```ts
const TripList = Trip.view('TripList', { id: true, driver: { name: true } });
const operation = Trip.domain.available.as(TripList);
const result = useOperationQuery(operation, input);
```

React cache identity includes the transported View AST. The View remains client-owned and does not
need a server registry entry.

Caller-authored Queries can use the remote graph-read protocol directly:

```tsx
const TodoListItem = TodoItem.view('TodoListItem', { id: true, title: true });
const openTodos = TodoItem.all()
  .where(todo => todo.completed.eq(false))
  .as(TodoListItem);

<OntahiGraphProvider
  runtime={{ name: 'browser' }}
  identity={{ principal: session.principal ?? null, cacheScope: session.workspaceId }}
>
  <TodoApp />
</OntahiGraphProvider>;

const todos = useGraphQuery(openTodos);
const total = useGraphQuery(openTodos.count());
const first = useGraphQuery(openTodos.first());
```

`OntahiGraphProvider` installs a conventional same-origin Fetch client by default. Operation
invocation and permission, Graph Read, Graph Command, and Durable Operation inspection all use one
Runtime Transport at `POST /runtime`. Reflected Explorer data remains outside the registered
Runtime Protocol families at `/explorer/entities` and `/explorer/related-entities`. These
capabilities are lazy: declaring the provider does not issue a request until the application uses
one of them.

Hosts can replace any individual capability through the existing provider props, install a
configured client with `client={createFetchGraphClient(...)}`, or set `client={false}` for a fully
explicit provider. Server routes, read policies, and authorization remain opt-in and authoritative;
the default removes client wiring, not the server security boundary.

The same client supports fluent execution outside React hooks:

```ts
const client = createFetchGraphClient();
const Todo = client.graph.bindClientEntity(GeneratedTodo);

const rows = await runBrowserEffect(Todo.all().as(TodoListItem).run());
```

The bound facade is a new value and retains the generated Entity's Views, Refs, and Domain
Operations. Its portable source facade and schema remain unchanged.

Generated client Entities expose portable `all()` and `where(...)` Query entry points. A Query
returns many rows by default; terminal `first()`, `one()`, `count()`, and `exists()` expressions
make the result contract explicit and let `useGraphQuery` select the executor method. `one()` is
strict cardinality, while `first()` may return `null`.

For transport-safe Queries, React derives a canonical key from the Entity, Selection, View,
ordering, limit, cardinality, and read intent. The key is also partitioned by the provider's
`ExecutionIdentity`. `principal` and optional JSON-safe `cacheScope` describe distributed client
state; they are not credentials and are never trusted for server authorization. The authoritative
runtime still derives its Principal from the request. Hosts should change identity when login,
logout, service identity, tenant, or workspace changes. An explicit `queryKey` remains available
for lower-level reads that cannot be encoded by the graph-read protocol, and the legacy explicit
`mode` API remains compatible.

First-class Operation invocations bind render-owned input without losing the declaration form:

```ts
const createTodo = useOperation(TodoItem.domain.createItem);
const completeVisible = useOperation(TodoItem.domain.complete({ todos: visibleTodos }));

await createTodo.executeAsync(newTodo);
await completeVisible.executeAsync();
```

The bound invocation always uses the latest render input. Passing the Operation declaration itself
keeps the lower-level reusable mutation form, where each execution supplies its input.

Durable Operations use the same invocation bridge to start a run, then observe its lifecycle
through Runtime Transport:

```tsx
const completeAll = useDurableOperation(TodoItem.domain.completeAll);

await completeAll.executeAsync();
// completeAll.status/progress/finalValue follow the accepted run.
```

The hook consumes an asynchronous snapshot sequence and does not choose polling or push. The
conventional Fetch Runtime Transport implements that sequence with versioned
`durable.operation.inspect` requests and owns the polling cadence:

```ts
const client = createFetchGraphClient({
  runtimeTransport: {
    endpoint: '/runtime/ontahi/runtime',
    durableOperation: { pollIntervalMs: 750 },
  },
});
```

The endpoint, Fetch implementation, credentials, headers, per-call request initialization, abort
signal, and request-id generator configured there serve every common request/response family.
Hosts can replace `runtimeTransport` independently on `OntahiGraphProvider`; a future push-capable
transport can yield the same snapshots without changing the hook.

Legacy family routes are opt-in migration surfaces:

```ts
const client = createFetchGraphClient({
  runtimeTransport: { endpoint: '/runtime' },
  compatibility: {
    operation: { endpoint: '/operations' },
    graphRead: { endpoint: '/graph/reads' },
    graphCommand: { endpoint: '/graph/commands' },
  },
});
```

An entry in `compatibility` selects that family’s legacy body and endpoint; every unlisted family
stays on Runtime Transport. It takes precedence over the deprecated `operations.endpoint`,
`operations.mountPath`, `graphRead.endpoint`, and `graphRead.commandEndpoint` aliases. Selection is
deterministic before transmission. A common request is never retried against a legacy endpoint
after a network or server failure, because replaying an Operation or Command could duplicate its
effect.

The Fetch executor sends only canonical graph-read and graph-Command requests. Credentials and
other trusted request state remain in Fetch initialization and are never embedded in a Query AST or
Command. The executor supports policy-bounded Relationship Commands and identity-scoped Entity
Mutation Commands; `useGraphExecutorCapability()` lets optional reflective UI discover whether the
host installed that execution surface without making it mandatory for read-only hosts.
