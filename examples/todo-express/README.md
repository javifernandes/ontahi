# Ontahi Todo Express Example

This is a small Ontahi application with interchangeable in-memory and direct PostgreSQL graph
storage. It declares lists, todos, tags, and a direct many-to-many Relation between todos and tags; executes
caller-authored browser Queries through the default-deny Express graph-read bridge; transports
Selections into write Operations; includes an in-process durable Operation and a host-supplied
notification Capability; generates browser-safe client declarations; and renders a React UI through
the public Ontahi hooks. It depends only on public Ontahi package exports.

## Run it against local Ontahi source

From a fresh repository checkout, start the Todo application and the Ontahi package watchers
together:

```sh
pnpm install
pnpm todo:dev:local
```

`todo:dev` is an alias for the same local-source mode. It builds only the example's Ontahi
dependencies, regenerates the client, builds the browser bundle, watches package output, and
restarts Express when framework code changes.

Open `http://localhost:3001` for the React UI. The **Runtime transport lab** section routes Graph
reads, Graph Commands, Operation calls, and Durable progress independently between the common HTTP
endpoint and WebSocket. It persists the selection locally and includes WebSocket-only, HTTP-only,
and HTTP-requests-plus-WebSocket-push presets. The default sends all four paths through one
`/runtime` WebSocket session. Selecting HTTP for Durable progress demonstrates the Fetch polling
fallback; selecting WebSocket receives pushed snapshots without browser polling. The same
`useGraphQuery`, `useOperation`, and `useDurableOperation` authoring is used for every combination.

Todo's in-process Task Runtime projects lifecycle writes through the framework `TaskRun` Entity.
The Express host adapts that native Stream to Durable protocol snapshots, so WebSocket mode has no
polling in either the browser or server. HTTP Durable progress remains the explicit Fetch polling
compatibility path.

The default is an explicit public mode: the complete application works without login and
`TodoItem.setCompleted` has no authentication requirement.

To exercise real authentication, create a GitHub OAuth App with
`http://localhost:3001/auth/github/callback` as its callback URL and start Todo in GitHub mode:

```sh
TODO_GITHUB_CLIENT_ID=... \
TODO_GITHUB_CLIENT_SECRET=... \
TODO_SESSION_SECRET=... \
pnpm todo:dev:local -- --auth github
```

GitHub mode fails immediately when any required credential is missing, mounts real Passport login,
session, callback, and logout routes, and adds `app.require.authenticated()` to
`TodoItem.setCompleted`. Passport and GitHub OAuth belong to this Express host.
The host maps Passport's authenticated `request.user` through
`authentication.principal(request)`. The common Runtime Protocol context and the explicit legacy
adapters derive their trusted authority from that same host function. Todo passes its default-deny
policies to the server dispatchers; no authorization or policy decision is serialized into the
browser request. The application storage supplies execution.
The same protected operation can be invoked from plain Node by establishing that scope explicitly:

```ts
await TodoApplication.app.runtime.withInvocationContext({ principal }, () =>
  TodoItem.setCompleted({ todos: ['todo-123'], completed: true }),
);
```

The default `express-session` memory store is intentional for this local example. A deployed host
must choose its own persistent session store and cookie policy.

The browser automatically presents the same signed `express-session` cookie when it upgrades the
same-origin `/runtime` URL to WebSocket. Todo runs the session and Passport restore middleware on
that upgrade, derives the Principal once, and rejects a missing or cross-origin browser `Origin`
before creating the Runtime session. It compares the complete origin, including scheme and host;
set `TODO_PUBLIC_ORIGIN=https://todo.example` when a TLS-terminating proxy makes that public origin
different from the direct server connection. A real deployment must use HTTPS/WSS, a shared
production session store across server instances, and a socket-revocation strategy if logout or
permission changes must invalidate an already-open connection immediately. Todo reloads after
logout so its current socket is closed.

## Run it against a published Ontahi version

The registry mode copies the example into an ignored `.artifacts` directory, replaces every
Ontahi workspace dependency with one exact published version, installs it outside the workspace,
verifies the resolved package versions and paths, and starts that isolated application:

```sh
pnpm todo:dev:registry
```

It defaults to the lockstep version declared by the packages in this checkout. To test another
published version explicitly:

```sh
pnpm todo:dev:registry -- --version 0.1.0-alpha.0
```

Registry mode accepts the same optional authentication flag:

```sh
TODO_GITHUB_CLIENT_ID=... \
TODO_GITHUB_CLIENT_SECRET=... \
TODO_SESSION_SECRET=... \
pnpm todo:dev:registry -- --version 0.1.0-alpha.0 --auth github
```

Neither mode changes the example manifest or the repository lockfile. Use `PORT=3002` or another
port when the default `3001` is already in use.

The default remains zero-infrastructure in-memory storage. To exercise the direct PostgreSQL
adapter with the host-owned migration:

Each in-memory process start creates the same small Inbox/Later workspace with todos and tags, so
the Todo UI and Explorer are immediately testable after a restart. Mutations remain process-local
and the deterministic seed is recreated on the next start. PostgreSQL storage is not seeded by
this path.

```sh
pnpm --filter @ontahi/example-todo-express db:start
pnpm --filter @ontahi/example-todo-express dev:postgres
```

The Compose service persists data in a named volume. Use `db:stop` to stop it or `db:reset` to
recreate the database and reapply every file in `migrations/`. PostgreSQL only runs these init
scripts when creating the volume, so reset an existing example database after pulling a new
migration.

The browser client needs only the common Runtime Protocol WebSocket endpoint:

```ts
const runtimeTransport = createWebSocketRuntimeTransport();
const client = createRuntimeGraphClient({ runtimeTransport });
```

Todo's transport lab composes this transport with `createFetchRuntimeTransport()` and routes the
existing envelope by `family`; Durable observation selects either the Fetch observer or the
WebSocket observer. Neither the generated Entities nor the React hooks know which route was chosen.

Fetch remains the portable fallback for hosts without WebSocket support. Configuring
`createFetchGraphClient({ runtimeTransport: { endpoint: '/runtime' } })` preserves the same
application authoring and implements Durable observation with transport-owned polling.

The family-specific routes remain available for explicit compatibility during migration. For
example, these calls use the legacy unwrapped Operation route:

```sh
curl -X POST http://localhost:3001/operations \
  -H 'content-type: application/json' \
  -d '{"kind":"invoke","operationId":"TodoList.createList","input":{"id":"list-1","name":"Inbox","color":"#f5ddd5"}}'

curl -X POST http://localhost:3001/operations \
  -H 'content-type: application/json' \
  -d '{"kind":"invoke","operationId":"TodoItem.createItem","input":{"id":"todo-1","list":{"kind":"entity-ref","entityName":"TodoList","locator":{"id":"list-1"}},"title":"Read the guide"}}'
```

Open `http://localhost:3001/explorer` to see `@ontahi/explorer-react` embedded in the same Vite
application. `ontahiExpress(TodoApplication, { explorer: ... })` mounts the operation bridge,
the explicitly configured Runtime Protocol dispatcher, legacy durable task snapshots, application
metadata, Explorer snapshot, reflected entity data, and the Explorer SPA. Execute panels use the
explicit legacy `/operations` bridge, while the Todo UI defaults to `/runtime` and reflected data
comes from whichever graph storage is active.

## Entities, Relations, Selections, and Operations

The example deliberately exercises two different domain structures:

- `TodoItem.list: field.ref(TodoList)` expresses composition: every todo item lives in one list. The same
  declaration is a Ref-valued field and the `belongsTo` relation; PostgreSQL lowers it to
  `list_id` only at the storage boundary.
- `TodoItem.tags` expresses an attribute-free many-to-many association directly. `todo_tags` remains
  physical edge storage; it is not reflected, generated, authorized, or manipulated as a semantic
  Entity.

The browser expresses the inverse membership as an ordinary Query rather than a wrapper Operation:

```ts
const visibleTodos = TodoItem.selection(todo => todo.list.eq(TodoList.refById(selectedListId)));
const todos = TodoItem.all()
  .where(visibleTodos)
  .as(TodoItemListItem)
  .orderBy(item => item.title);
```

The generated schema authors the selection, while the caller-owned View chooses its result shape.
The server independently validates both against `TodoItem`'s explicit remote read policy.

Each entity owns its fields, identity, relations, and operations in one semantic declaration.
`TodoItem.setCompleted` accepts `self.many()` inside that declaration, so its target cardinality is
part of the validated operation contract instead of an example-local list of IDs. Ontahi keeps the
selection representation behind the entity-facing API.

`relationshipSet(TodoItem, 'tags', todos).add(tags)` combines Selection-valued source and target
endpoints in one structural Relationship Command. Ontahi validates explicit identities, resolves
both Selections at execution time, applies the Cartesian edge delta atomically, and returns only the
links actually added. `remove` uses the same canonical Relation identity. No application Operation
or join-Entity repository is needed for this structural behavior.

A caller can define membership by reference:

```json
{
  "kind": "selection",
  "entityName": "TodoItem",
  "expression": {
    "kind": "references",
    "refs": [{ "kind": "entity-ref", "entityName": "TodoItem", "locator": { "id": "todo-1" } }]
  }
}
```

Or by predicate:

```json
{
  "kind": "selection",
  "entityName": "TodoItem",
  "expression": { "kind": "predicate", "operator": "eq", "fieldName": "completed", "value": false }
}
```

Send either value as the `todos` field when invoking `TodoItem.setCompleted`, together with the
desired `completed` Boolean. Ontahi validates the Selection, hydrates it at the transport boundary,
and evaluates the same settled Selection algebra in the in-memory update command.

The generated client preserves operation input and output schemas, so React infers hook types without local record declarations or generic arguments:

```ts
const visibleTodos = TodoItem.selection(todo => todo.list.eq(TodoList.refById(selectedListId)));
const todos = useGraphQuery(TodoItem.all().where(visibleTodos).as(TodoItemListItem));
const createTodo = useOperation(TodoItem.domain.createItem);
const setVisibleCompleted = useOperation(
  TodoItem.domain.setCompleted({ todos: visibleTodos, completed: true }),
);
const completeAll = useDurableOperation(TodoList.domain.completeAll);

setVisibleCompleted.execute();
completeAll.execute({ list: TodoList.refById(selectedListId) });
```

The generated client Entity owns the portable Query entry point. `useGraphQuery` infers both the
many-row execution mode and a canonical Entity-prefixed cache key. The application supplies its
current `ExecutionIdentity` to `OntahiGraphProvider`, so authenticated, public, and session-loading
reads cannot reuse each other's cache entries; the server still authenticates every request from
trusted request context.

`TodoItem.deleteAll` demonstrates a void-input delete command and lets the UI clear whichever storage
runtime is active.

For explicit members, the hook accepts IDs or entity records and derives refs through the entity's
default identity:

```ts
await setTodosCompleted.executeAsync({ todos: selectedIds, completed: true });
```

The operation still receives `Selection<typeof TodoItem>` on the server, and the transport still
carries an explicit Selection AST containing refs. `TodoItem.selection(...)` authors predicate-based
membership from either the bound Node entity or its generated browser projection; Boolean
composition refines that same value without creating a UI-only filter language.

## How the application fits together

1. [`src/storage.ts`](./src/storage.ts) selects one default graph storage—either in-memory
   or PostgreSQL. The host owns the physical mapping, migration, database connection, process
   lifetime, and error reporting policy.
2. [`src/todo.ts`](./src/todo.ts) exports the `TodoList`, `TodoItem`, and `Tag`
   declarations, including their identities, relations, write Operations, and durable Operation.
   [`src/todo-read-policies.ts`](./src/todo-read-policies.ts) separately declares the browser-visible
   read surface and the Relationship Command policy exposes only `TodoItem.tags` link/unlink.
3. [`src/graph.ts`](./src/graph.ts) is the single composition root. `ontahi(...)` binds storage,
   `inProcessTasks()`, the notification Capability, and the public entities into the complete
   `TodoApplication` used by reflection, execution, tasks, ingress, and code generation. Task
   executor and storage can be configured separately when durable state must outlive the process.
4. [`src/application.ts`](./src/application.ts) mounts the Operation and graph-read bridges plus an
   explicit Durable observation handler behind the common Runtime Protocol path through one
   `ontahiExpress(...)` middleware.
5. The `ontahi-codegen` command analyzes the conventional `src/graph.ts` composition root and
   reproducibly emits `src/generated/client-entities.ts`; the app carries no custom generation
   script.
6. [`client/src/App.tsx`](./client/src/App.tsx) consumes caller-authored Queries and the remaining
   domain Operations exclusively through `@ontahi/react` hooks.
7. [`client/src/Explorer.tsx`](./client/src/Explorer.tsx) embeds the reusable Explorer components;
   the Express adapter derives their server endpoints from `TodoApplication`.

`@ontahi/core` provides declarations, validation, graph policy, operation invocation, task execution,
and the in-memory reference runtimes. `@ontahi/react` owns the provider, hooks, cache invalidation,
Fetch graph executor, and Operation bridge. `@ontahi/runtime-express` only translates HTTP requests
and responses. `@ontahi/codegen` is a build-time dependency; it projects the browser-safe Entity
schemas and Operation surface from the same semantic declaration.

`@ontahi/postgres` translates the same data graph reads and commands into parameterized SQL. It
does not infer migrations: this example deliberately keeps physical schema evolution under host
control.

## Development error diagnostics

Unexpected operation defects are sanitized before crossing a transport. A production browser
receives an `internal_error` and the operation's public failure message, never an arbitrary server
exception.

During local development, a host can explicitly expose a JSON-safe error chain:

```ts
import { configureServerRuntime } from '@ontahi/core/runtime/server';

configureServerRuntime({
  diagnostics: {
    exposeInternalErrorCauses: process.env.NODE_ENV !== 'production',
  },
});
```

The bridge then includes the normalized chain under `result.failure.cause`. React throws an
`OperationInvocationResultError` whose `cause` is that transported failure and whose `toJSON()`
preserves the same diagnostic data. The option is disabled by default because exception messages
can reveal server implementation details.

## Verify it

```sh
pnpm --filter @ontahi/example-todo-express codegen:check
pnpm --filter @ontahi/example-todo-express typecheck
pnpm --filter @ontahi/example-todo-express test
```

The integration test starts a real ephemeral HTTP server, compares one projected Query through
direct and remote execution, verifies reference-defined and predicate-defined Selections mutate
only their target entities, assigns tags through a direct Relationship Command, exercises the durable
Operation, and verifies invalid input returns Ontahi's canonical `input_invalid` result.

## Host responsibilities exposed by the example

- Choose graph storage and, when durable operations are used, task executor and storage.
- Own process lifecycle, port selection, JSON parsing, routing, and logging.
- Supply persistent adapters when process-local state is insufficient.
- Supply the application Capabilities declared by Entities.
- Authenticate native requests and map provider users to an Ontahi Principal.
- Choose which operations are bridge-exposed or server-only.
- Explicitly declare every Entity, field, operator, relation, mode, cardinality, limit, and row scope
  exposed through remote graph reads.
- Run code generation at build time and commit or check its deterministic outputs.
- Mount `@ontahi/explorer-react` in a React host when the full visual Explorer is useful.
