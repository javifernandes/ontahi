# Ontahi Todo Express Example

This is a small, zero-infrastructure Ontahi application. It declares a Todo entity, transports graph-native Selections into synchronous operations over Express, includes an in-process durable operation, stores graph and task state in memory, generates a browser-safe client declaration, and renders a React UI through the public Ontahi hooks. It imports no BookOps code.

## Run it

From a fresh repository checkout:

```sh
pnpm install
pnpm --filter @ontahi/example-todo-express codegen
pnpm --filter @ontahi/example-todo-express start
```

Open `http://localhost:3001` for the React UI. It uses `OntahiGraphProvider`, the Fetch operation bridge, `useOperationQuery`, `useOperation`, and `useDurableOperation` against the same Express process.

You can also create a Todo directly through Ontahi's transport-neutral invocation protocol:

```sh
curl -X POST http://localhost:3001/operations \
  -H 'content-type: application/json' \
  -d '{"kind":"invoke","operationId":"Todo.create","input":{"id":"todo-1","title":"Read the guide"}}'
```

Inspect the reflected application model at `GET /application`. The React Explorer is intentionally omitted from this minimal host: it needs a React renderer and routing shell, while this endpoint exposes the same application inventory without adding a browser application.

## Entity, Selection, and Operation

`TodoEntity` declares the records and their `refById` identity. `Todo.complete` accepts `graphSchema.selection(TodoEntity, { cardinality: 'many' })`, so its target is part of the validated operation contract instead of an example-local list of IDs.

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
const todos = useOperationQuery(Todo.domain.list);
const createTodo = useOperation(Todo.domain.create);
const completeAll = useDurableOperation(Todo.domain.completeAll);

completeAll.execute();
```

Client-side membership uses the same public Selection language rather than manually constructing its transport AST:

```ts
const selected = Selection.references(
  TodoEntity,
  selectedIds.map(id => createEntityRef(TodoEntity, { id })),
);
```

## How the application fits together

1. [`src/architecture.ts`](./src/architecture.ts) composes the public in-memory graph runtime and in-process task runtime. The host owns the live dataset, task store, process lifetime, and error reporting policy.
2. [`src/todo.ts`](./src/todo.ts) declares the entity, schemas, synchronous operation, and durable operation using `@ontahi/core` only.
3. [`src/graph.ts`](./src/graph.ts) collects public entities into the graph API used by reflection, operation lookup, and code generation.
4. [`src/application.ts`](./src/application.ts) connects Ontahi's dispatcher to the Express transport adapter.
5. [`scripts/generate-client.mjs`](./scripts/generate-client.mjs) analyzes the graph declaration through `@ontahi/codegen` and reproducibly emits `src/generated/client-entities.ts`.
6. [`client/src/App.tsx`](./client/src/App.tsx) consumes that generated declaration exclusively through `@ontahi/react` hooks. Vite only bundles the browser shell; Express serves its static output.

`@ontahi/core` provides declarations, validation, operation invocation, task execution, and the in-memory reference runtimes. `@ontahi/react` owns the provider, hooks, cache invalidation, and Fetch bridge. `@ontahi/runtime-express` only translates HTTP requests and responses. `@ontahi/codegen` is a build-time dependency; generated browser declarations do not import server operation implementations.

## Verify it

```sh
pnpm --filter @ontahi/example-todo-express codegen:check
pnpm --filter @ontahi/example-todo-express typecheck
pnpm --filter @ontahi/example-todo-express test
```

The integration test starts a real ephemeral HTTP server, verifies reference-defined and predicate-defined Selections mutate only their target entities, exercises the durable operation, and verifies invalid input returns Ontahi's canonical `input_invalid` result.

## Host responsibilities exposed by the example

- Choose and configure graph and task runtime adapters.
- Own process lifecycle, port selection, JSON parsing, routing, and logging.
- Supply persistent adapters when process-local state is insufficient.
- Choose which operations are bridge-exposed or server-only.
- Run code generation at build time and commit or check its deterministic outputs.
- Mount `@ontahi/explorer-react` in a React host when the full visual Explorer is useful.
