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
const graphExecutor = createFetchGraphReadExecutor({ endpoint: '/graph/reads' });
const TodoListItem = TodoItem.view('TodoListItem', { id: true, title: true });
const openTodos = query(TodoItemSchema)
  .where(todo => todo.completed.eq(false))
  .as(TodoListItem);

<OntahiGraphProvider runtime={{ name: 'browser' }} graphExecutor={graphExecutor}>
  <TodoApp />
</OntahiGraphProvider>;

const todos = useGraphQuery(openTodos, {
  mode: 'run',
  queryKey: ['TodoItem', 'open'],
});
```

The Fetch executor sends only the canonical graph-read request. Credentials and other trusted
request state remain in Fetch initialization and are never embedded in the Query AST. Remote
Commands remain unsupported until the graph Command protocol and its policy boundary are defined.
