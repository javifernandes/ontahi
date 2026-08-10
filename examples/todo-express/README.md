# Ontahi Todo Express Example

This is a small Ontahi application with interchangeable in-memory and direct PostgreSQL graph
storage. It declares lists, todos, tags, and the associative entity between todos and tags;
transports graph-native Selections into synchronous operations over Express; includes an in-process
durable operation and a host-supplied notification Capability; generates browser-safe client
declarations; and renders a React UI through the public Ontahi hooks. It imports no BookOps code.

## Run it

From a fresh repository checkout:

```sh
pnpm install
pnpm --filter @ontahi/example-todo-express codegen
pnpm --filter @ontahi/example-todo-express start
```

Open `http://localhost:3001` for the React UI. It uses `OntahiGraphProvider`, the Fetch operation bridge, `useOperationQuery`, `useOperation`, and `useDurableOperation` against the same Express process.

The default remains zero-infrastructure in-memory storage. To exercise the direct PostgreSQL
adapter with the host-owned migration:

```sh
pnpm --filter @ontahi/example-todo-express db:start
pnpm --filter @ontahi/example-todo-express dev:postgres
```

The Compose service persists data in a named volume. Use `db:stop` to stop it or `db:reset` to
recreate the database and reapply `migrations/001-create-todos.sql`.

You can also create a list and then a Todo directly through Ontahi's transport-neutral invocation
protocol:

```sh
curl -X POST http://localhost:3001/operations \
  -H 'content-type: application/json' \
  -d '{"kind":"invoke","operationId":"TodoList.create","input":{"id":"list-1","name":"Inbox"}}'

curl -X POST http://localhost:3001/operations \
  -H 'content-type: application/json' \
  -d '{"kind":"invoke","operationId":"Todo.create","input":{"id":"todo-1","listId":"list-1","title":"Read the guide"}}'
```

Open `http://localhost:3001/explorer` to see `@ontahi/explorer-react` embedded in the same Vite
application. `ontahiExpress(TodoApplication, { explorer: ... })` mounts the operation bridge,
durable task snapshots, application metadata, Explorer snapshot, reflected entity data, and the
Explorer SPA. Execute panels use the same `/operations` bridge as the Todo UI, while reflected data
comes from whichever graph storage is active.

## Entities, Relations, Selections, and Operations

The example deliberately exercises two different domain structures:

- `Todo belongsTo TodoList` expresses composition: every todo lives in one list.
- `Todo hasMany TodoTag` and `TodoTag belongsTo Tag` express association through an explicit
  semantic join entity. Ontahi does not hide the association behind a storage-only join table.

`TodoTag.remove` accepts that association as a semantic target, so
`TodoTag.refByTodoAndTag(todoId, tagId)` can remove one assignment without inventing a synthetic
join identity.

Each entity owns its fields, identity, relations, and operations in one semantic declaration.
`Todo.complete` accepts `graphSchema.selection(self, { cardinality: 'many' })` inside that
declaration, so its target is part of the validated operation contract instead of an example-local
list of IDs.

`Todo.assignTags` combines that semantic target with explicit tag identities. It validates those
identities, resolves the Todo Selection at execution time, and creates all idempotent `TodoTag`
associations with one bulk upsert. The UI can therefore assign one tag to any explicit set of todos
without multiplying the operation API by list or filter.

A caller can define membership by reference:

```json
{
  "kind": "selection",
  "entityName": "Todo",
  "expression": {
    "kind": "references",
    "refs": [{ "kind": "entity-ref", "entityName": "Todo", "locator": { "id": "todo-1" } }]
  }
}
```

Or by predicate:

```json
{
  "kind": "selection",
  "entityName": "Todo",
  "expression": { "kind": "predicate", "operator": "eq", "fieldName": "completed", "value": false }
}
```

Send either value as the `todos` field when invoking `Todo.complete`. Ontahi validates the Selection, hydrates it at the transport boundary, and evaluates the same settled Selection algebra in the in-memory update command.

The generated client preserves operation input and output schemas, so React infers hook types without local record declarations or generic arguments:

```ts
const visibleTodos = Todo.selection(todo => todo.listId.eq(selectedListId));
const todos = useOperationQuery(Todo.domain.list, visibleTodos);
const createTodo = useOperation(Todo.domain.create);
const completeAll = useDurableOperation(Todo.domain.completeAll);

completeAll.execute();
```

`Todo.deleteAll` demonstrates a void-input delete command and lets the UI clear whichever storage
runtime is active.

For explicit members, the hook accepts IDs or entity records and derives refs through the entity's
default identity:

```ts
await completeTodos.executeAsync({ todos: selectedIds });
```

The operation still receives `Selection<typeof Todo>` on the server, and the transport still
carries an explicit Selection AST containing refs. `Todo.selection(...)` authors predicate-based
membership from either the bound Node entity or its generated browser projection; Boolean
composition refines that same value without creating a UI-only filter language.

## How the application fits together

1. [`src/storage.ts`](./src/storage.ts) selects one default graph storage—either in-memory
   or PostgreSQL. The host owns the physical mapping, migration, database connection, process
   lifetime, and error reporting policy.
2. [`src/todo.ts`](./src/todo.ts) exports the `TodoList`, `Todo`, `Tag`, and `TodoTag`
   declarations, including their identities, relations, synchronous operations, and durable
   operation.
3. [`src/graph.ts`](./src/graph.ts) is the single composition root. `ontahi(...)` binds storage,
   `inProcessTasks()`, the notification Capability, and the public entities into the complete
   `TodoApplication` used by reflection, execution, tasks, ingress, and code generation. Task
   executor and storage can be configured separately when durable state must outlive the process.
4. [`src/application.ts`](./src/application.ts) mounts that application through one
   `ontahiExpress(...)` middleware.
5. [`scripts/generate-client.mjs`](./scripts/generate-client.mjs) analyzes the graph declaration through `@ontahi/codegen` and reproducibly emits `src/generated/client-entities.ts`.
6. [`client/src/App.tsx`](./client/src/App.tsx) consumes that generated declaration exclusively through `@ontahi/react` hooks.
7. [`client/src/Explorer.tsx`](./client/src/Explorer.tsx) embeds the reusable Explorer components;
   the Express adapter derives their server endpoints from `TodoApplication`.

`@ontahi/core` provides declarations, validation, operation invocation, task execution, and the in-memory reference runtimes. `@ontahi/react` owns the provider, hooks, cache invalidation, and Fetch bridge. `@ontahi/runtime-express` only translates HTTP requests and responses. `@ontahi/codegen` is a build-time dependency; it projects the browser operation surface from the same semantic declaration.

`@ontahi/postgres` translates the same data graph reads and commands into parameterized SQL. It
does not infer migrations: this example deliberately keeps physical schema evolution under host
control.

## Verify it

```sh
pnpm --filter @ontahi/example-todo-express codegen:check
pnpm --filter @ontahi/example-todo-express typecheck
pnpm --filter @ontahi/example-todo-express test
```

The integration test starts a real ephemeral HTTP server, verifies reference-defined and
predicate-defined Selections mutate only their target entities, assigns tags through the
associative entity, exercises the durable operation, and verifies invalid input returns Ontahi's
canonical `input_invalid` result.

## Host responsibilities exposed by the example

- Choose graph storage and, when durable operations are used, task executor and storage.
- Own process lifecycle, port selection, JSON parsing, routing, and logging.
- Supply persistent adapters when process-local state is insufficient.
- Supply the application Capabilities declared by Entities.
- Choose which operations are bridge-exposed or server-only.
- Run code generation at build time and commit or check its deterministic outputs.
- Mount `@ontahi/explorer-react` in a React host when the full visual Explorer is useful.
