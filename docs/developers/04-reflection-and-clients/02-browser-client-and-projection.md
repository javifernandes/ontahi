# Browser Client and Projection

A \concept{Client Projection} preserves the public, executable portion of the application model
for another environment. The browser does not import the server application. It receives a
projection of the same model: browser-safe Entity schemas, identity and locator rules, Relations,
Selection and Query authoring, and the contracts of Operations exposed through a bridge.

Operation bodies, Capability implementations, storage, task executors, secrets, and server-only
Operations stay on the server.

Every analyzable Ontahí application can produce this projection. Producing it is optional: a
server-only or Node-only application needs no generated client artifact. The boundary appears only
when another runtime needs to carry the model without carrying its server implementation.

## Generate the browser surface

The host installs codegen as a development dependency:

```sh
pnpm add --save-exact --save-dev @ontahi/codegen@alpha
```

The conventional application needs only package scripts:

```json
{
  "scripts": {
    "codegen": "ontahi-codegen",
    "codegen:check": "ontahi-codegen --check"
  }
}
```

`pnpm codegen` analyzes `src/graph.ts` and writes `src/generated/client-entities.ts`. `--watch`
regenerates when a source in the application model changes. Hosts with a different layout can
state only that difference:

```sh
ontahi-codegen --graph server/application.ts --output browser/generated/entities.ts
```

The generated client projection is intentionally smaller than the analyzed application. It
carries enough meaning for code such as this to remain typed and semantic in the browser:

```ts
TodoItem.refById('todo-write-outline');
TodoItem.selection(todo => todo.completed.eq(false));
TodoItem.all();
TodoItem.domain.complete.input;
```

The generated file is deterministic and checked for drift; application code imports it but does
not edit it. The command owns analysis, diagnostics, rendering, writes, and dependency-aware watch
lifecycle. The lower-level `@ontahi/codegen` API remains available for build systems that need
multiple or custom projections.

> [!MARGIN] **Projection is not a shared server bundle.** A conventional shared-types package may
> reproduce request and response shapes while losing identity, Selection semantics, and Operation
> metadata. Ontahí projects those links from the application declaration and omits the executable
> server implementation.

## Keep Views in the client

A \concept{View} is a caller-owned materialization document. Codegen gives the browser the Entity
facade needed to author one, but it does not generate or register the View:

```ts
const TodoListItem = TodoItem.view('TodoListItem', {
  id: true,
  list: true,
  title: true,
  completed: true,
});
```

A `true` Reference Field remains a Ref. A nested object traverses the declared Relation and
materializes the target:

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
      country: { code: true },
    },
  },
});
```

The recursive shape is finite and JSON-safe. The server validates every path against its canonical
Entity and Relation declarations. Ontahí never recursively hydrates a Relation merely because it
is reachable.

## Compose the browser runtime once

The conventional same-origin client needs no endpoint wiring:

```tsx
const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <OntahiGraphProvider
    runtime={{ name: 'browser' }}
    identity={{
      principal: session.principal ?? null,
      cacheScope: session.workspaceId,
    }}
  >
    <App />
  </OntahiGraphProvider>
</QueryClientProvider>;
```

The provider installs one lazy Fetch client for the conventional routes:

- `/graph/reads` for Queries;
- `/graph/commands` for explicitly permitted Relationship Commands;
- `/operations` for Operations;
- `/operations/tasks` for durable snapshots;
- `/explorer/entities` for reflected Entity data.

Mounting the provider sends no request. A hook uses a capability only when a component asks for
it. A host with another mount root configures the bundle once:

```tsx
const client = createFetchGraphClient({
  graphRead: {
    endpoint: '/runtime/ontahi/graph/reads',
    commandEndpoint: '/runtime/ontahi/graph/commands',
  },
  operations: { mountPath: '/runtime/ontahi' },
  reflectedEntityData: { endpoint: '/runtime/ontahi/explorer/entities' },
});

<OntahiGraphProvider runtime={runtime} client={client}>
  <App />
</OntahiGraphProvider>;
```

Individual provider props remain available as lower-level overrides. `client={false}` disables the
conventional bundle for a fully explicit host.

The client default does not mount server routes or grant data access. The authoritative host must
still install its Operation bridge and explicitly enable policy-scoped graph reads.

## A Selection becomes an observation

The UI authors the same membership language used from Node:

```tsx
const visibleTodos = useMemo(() => {
  const inList = TodoItem.selection(todo => todo.list.eq(TodoList.refById(selectedListId)));

  return status === 'all' ? inList : inList.and(todo => todo.completed.eq(status === 'completed'));
}, [selectedListId, status]);

const todosQuery = useMemo(
  () =>
    TodoItem.all()
      .where(visibleTodos)
      .as(TodoListItem)
      .orderBy(todo => todo.title),
  [visibleTodos],
);

const todos = useGraphQuery(todosQuery, {
  enabled: Boolean(selectedListId),
});
```

The generated Entity is the ordinary Query entry point. Many results are the default; terminal
read intentions change the result contract without repeating an execution mode:

```tsx
const first = useGraphQuery(todosQuery.first());
const one = useGraphQuery(todosQuery.one());
const count = useGraphQuery(todosQuery.count());
const exists = useGraphQuery(todosQuery.exists());
```

`first()` may return `null`; `one()` asserts strict cardinality. React derives the ordinary query
key from the canonical Entity, Selection, View, ordering, limit, cardinality, and read intention.
An explicit `mode` or `queryKey` remains a lower-level escape hatch for reads that cannot be encoded
as a transport-safe graph program.

## Mutate direct topology as a Relationship Command

A browser does not need to invent a Domain Operation merely to add or remove a permitted direct
many-to-many link. The Todo client builds the same portable command and lets the configured graph
executor choose direct or remote execution:

```tsx
const linkTags = useManyToManyRelationshipCommand(
  ({ todoIds, tagId }: { todoIds: string[]; tagId: string }) => {
    const todos = Selection.references(
      TodoItemSchema,
      todoIds.map(id => createEntityRef(TodoItemSchema, { id })),
    );
    const tag = createEntityRef(TagSchema, { id: tagId });
    return relationshipSet(TodoItemSchema, 'tags', todos).add(tag);
  },
  { onSuccess: () => visibleTodos.refetch() },
);

await linkTags.mutateAsync({ todoIds: selectedTodoIds, tagId: selectedTagId });
```

The remote path is default-deny and requires an explicit server graph-command policy for that
Relation and action. The result is `applied` with an exact delta or `not-applied` with a structured
diagnostic. Generic Entity Commands are not remote yet; server-only insert, update, upsert, and
delete still enter through Operations.

## Partition observations by execution identity

The same Query can mean different distributed state before login, after login, or in another
workspace. `ExecutionIdentity` partitions the derived cache key:

```ts
{
  principal: session.principal ?? null,
  cacheScope: session.workspaceId,
}
```

Changing Principal, tenant, service, or workspace therefore prevents one identity from reusing
another identity's cached observation.

This value is not a credential and is never trusted for authorization. Fetch owns browser
credentials. The server authenticates the native request, derives its own Principal, applies the
graph policy, and may intersect the requested Selection with an authority-owned row scope.

> [!MARGIN] **Cache identity and authority are different boundaries.** The client needs identity to
> partition distributed state. Only the server request context can authorize execution.

## Invoke named behavior as an Operation

Use an Operation when the application is asking the domain to do something rather than merely
reading its graph:

```tsx
const createTodo = useOperation(TodoItem.domain.create);
await createTodo.executeAsync({ id, list, title });
```

The declaration form is reusable: each execution supplies its input. A component may instead bind
its current semantic input into a first-class invocation:

```tsx
const completeVisible = useOperation(TodoItem.domain.complete({ todos: visibleTodos }));

await completeVisible.executeAsync();
```

The bound invocation keeps the latest render-owned input and execution takes no argument. Both
forms use the same generated Operation contract and bridge protocol.

## Shape a projectable Operation result

An Operation may own semantic population while its caller owns materialization. Apply a View to a
generated Operation whose output is `self.one()` or `self.many()`:

```tsx
const AvailableTrip = Trip.view('AvailableTrip', {
  id: true,
  driver: { name: true },
});

const availableTrips = Trip.domain.available.as(AvailableTrip);
const trips = useOperationQuery(availableTrips, input);
```

The bridge carries the Operation input and View AST. The server validates the View against the
declared output Entity, executes the Operation to obtain a declarative Selection, and combines
population plus shape into one final Query. Complete composition requires the Operation to return
that Selection without materializing an imperative read first.

The direct Query and bridged Operation are different execution routes, not different shaping
languages:

- a Query carries an ordinary Data Graph read;
- an Operation invocation carries named domain behavior;
- the caller-owned View shapes either result.

## Cache snapshots by Entity identity

Suppose two results contain the same TodoItem:

```text
open todos    -> [TodoItem A, TodoItem B]
research list -> [TodoItem B, TodoItem C]
```

The client cache can replace each Entity snapshot with its canonical Ref and store one current
record per Entity identity:

```text
open     -> [Ref A, Ref B]
research -> [Ref B, Ref C]

Ref B -> current TodoItem B snapshot
```

When React reads either observation, Ontahí resolves those Refs back into materialized values. An
update learned through one result can therefore be visible anywhere that the same identity is
used. Declared alternate locators resolve to the same canonical record.

This is why generated output contracts matter at runtime. Opaque JSON can be cached as a result;
Entity output can also participate in graph identity.

> [!MARGIN] **Identity is semantic, not JavaScript reference equality.** Components receive
> materialized snapshots suitable for ordinary rendering. Ontahí unifies them because they refer
> to the same Entity, not because every read returns the same object instance.

## Reconcile results, then invalidate observations

Operation bridge metadata describes the semantic area a mutation may have changed. After a
successful invocation, Ontahí first reconciles returned Entity snapshots and then invalidates the
matching observations:

```tsx
const complete = useOperation(TodoItem.domain.complete);

await complete.executeAsync({ todos: visibleTodos });
```

Entity-wide invalidation is deliberately coarse. The browser component does not manufacture keys
or copy a result into each filtered list; React refetches each stale Query through its own canonical
graph program.

> [!MARGIN] **TanStack Query is the current React observer.** It schedules requests, exposes loading
> state, and refetches invalidated observations. Query keys and normalized Entity records are
> derived from Ontahí contracts; they are not a second domain model authored in components.

## Durable completion is the invalidation boundary

A durable invocation succeeds when the runtime accepts a run. Its data changes may happen later in
a worker, so invalidating at acceptance could refetch the old state.

`useDurableOperation` observes the accepted `TaskRunRef`. It invalidates the Operation's declared
observations only after the snapshot reaches `completed`; `failed` and `cancelled` runs do not
pretend that the intended change happened.

The invariant across ordinary and durable Operations is the same: the projected contract tells the
browser what was invoked, what kind of value came back, and which observations may now be stale.
Codegen carries that meaning across the process boundary; the client runtime interprets it.
