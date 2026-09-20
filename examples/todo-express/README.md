# Ontahi Todo Express Example

This is a small Ontahi application with interchangeable in-memory, direct PostgreSQL, and MySQL graph
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

Open `http://localhost:3001` for the React UI, open Ontahí Devtools from its ceibo launcher, and
select **Settings** to configure Runtime transport routing. The controls route Graph reads, Graph
Commands, Operation calls, Durable status and progress, and Graph observation independently between
the common HTTP endpoint and WebSocket. `@ontahi/devtools/react` derives the controls and preferred
transport profiles from the Runtime Transport router; Todo carries no settings component, presets,
or routing state. The default sends every supported capability through one `/runtime` WebSocket
session. The HTTP profile keeps Graph observation on WebSocket because the Fetch adapter does not
claim that capability. Selecting HTTP for Operation progress demonstrates the Fetch polling
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
and the deterministic seed is recreated on the next start. PostgreSQL and MySQL storage are not seeded by
this path.

```sh
pnpm --filter @ontahi/example-todo-express db:start
pnpm --filter @ontahi/example-todo-express dev:postgres
```

The Compose service persists data in a named volume. Use `db:stop` to stop it or `db:reset` to
recreate the database and reapply every file in `migrations/`. PostgreSQL only runs these init
scripts when creating the volume, so reset an existing example database after pulling a new
migration.

To use MySQL 8.4/InnoDB instead, build the packages and browser client once, then start the host:

```sh
pnpm build:packages
pnpm --filter @ontahi/example-todo-express build:client
export TODO_MYSQL_PASSWORD="$(openssl rand -hex 24)"
pnpm --filter @ontahi/example-todo-express db:mysql:start
pnpm --filter @ontahi/example-todo-express dev:mysql
```

`TODO_STORAGE=mysql` selects the adapter. The local host uses `TODO_MYSQL_PASSWORD` on port 33069;
`DATABASE_URL` can instead supply a complete connection URI. Keep the same password when restarting
a database with an existing volume; generate a new one only for a new database. The MySQL Compose profile owns a separate named volume and initializes it
from `migrations-mysql/`. Those SQL files own tables, foreign keys, edge uniqueness, and a trigger
that assigns each new item a position while locking its list. Ontahi owns subsequent ordered moves.
Changes to init SQL apply only when creating a fresh volume. Stop MySQL with
`docker compose --profile mysql stop mysql` from this example directory; stopping retains its data.

The integration test requires Docker running and generates a fresh random database password per run. It starts and removes its own isolated MySQL container,
without using the Compose volume, and starts two separate Express host processes to
verify that lists, items, tags, and order survive the first host's shutdown:

```sh
pnpm --filter @ontahi/example-todo-express exec vitest run src/mysql-storage.integration.test.ts
```

The browser client needs only the common Runtime Protocol WebSocket endpoint:

```ts
const runtimeTransport = createWebSocketRuntimeTransport();
const client = createRuntimeGraphClient({ runtimeTransport });
```

Todo composes this transport with `createFetchRuntimeTransport()` through Core's
`createRuntimeTransportRouter(...)`. The router routes existing envelopes by family and selects the
Fetch or WebSocket capability for Durable and Graph observation. Neither the generated Entities nor
the React hooks know which route was chosen.

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
- `TodoList.items` is the ordered inverse of that required Ref. Drag and keyboard reordering send a
  native ordered Relationship Command; the browser reads the authoritative nested sequence and
  keeps only the in-flight optimistic projection locally.
- `TodoItem.tags` expresses an attribute-free many-to-many association directly. `todo_tags` remains
  physical edge storage; it is not reflected, generated, authorized, or manipulated as a semantic
  Entity.

The browser reads list membership and sequence as one nested ordered Relation rather than a wrapper
Operation or a second root Query:

```ts
const TodoListItem = TodoList.view('TodoListItem', {
  id: true,
  name: true,
  items: { id: true, title: true, completed: true, tags: { id: true, name: true } },
});
const lists = TodoList.all()
  .as(TodoListItem)
  .orderBy(list => list.name);
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
   read surface and the Relationship Command policy exposes only `TodoItem.tags` link/unlink plus
   `TodoList.items` move.
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
6. [`client/src/App.tsx`](./client/src/App.tsx) consumes caller-authored Queries, native ordered and
   many-to-many Relationship Commands, and the remaining domain Operations exclusively through
   `@ontahi/react` hooks.
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

The Console supports contextual Selection navigation with the in-memory and PostgreSQL providers:

```text
TodoList.openItems.many()
TodoList.openItems.labels.many()
TodoList.where(name = "Later").openItems.where(completed = false).many()

TodoList through openItems many
TodoList through openItems through labels many
TodoList where name = "Later" through openItems where completed = false many
```

`openItems` is declared on TodoList from `self.items.where(item => item.completed.eq(false))`;
`labels` is declared on TodoItem from `self.tags`. The outgoing `items`/`tags` membership hops are
explicitly granted by the read policies. No source rows are fetched to build these selections.
Filters and rich value editors resolve the Entity at each stage: `name` belongs to TodoList,
`completed` to TodoItem. Filters can precede or follow a hop; repeated filters intersect.
Ordering/limit still shape only the final result. There is no intermediate `.one()` or fetch.
MySQL contextual reads remain unsupported and the Console explains that capability boundary.

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

## Local model-backed command spike

Enable the optional assistant with an installed Ollama model. It floats at the bottom center of the board. Write the instruction directly;
name a list in the message only when needed. Send with the arrow or Command/Ctrl+Enter.
The latest exchange is visible by default, with earlier exchanges behind the history icon. Each message is independent: this is not a resumable chat or
an autonomous agent.

```sh
brew install ollama
ollama serve
# In another terminal:
ollama pull qwen3.5:0.8b
TODO_LLM_MODEL=qwen3.5:0.8b TODO_STORAGE=in-memory TODO_AUTH_MODE=disabled pnpm todo:dev:local
```

The microphone button uses the browser's Web Speech API to append dictation to the draft.
Interim results replace each other; nothing is sent automatically. Stop dictation, review/edit,
and use the send arrow or Command/Ctrl+Enter. Choose EN or ES beside the microphone; the selection is saved in browser storage and defaults to EN. Unsupported
browsers show a disabled microphone; permission and device errors leave typing available.
Ontahi does not upload audio, but the browser may use an online recognition service; this is not
an offline guarantee. See [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

The speaker button enables reading replies aloud, initially off for each chat mount. Enabling it
reads the latest reply; subsequent replies are read automatically. EN/ES selects the speech synthesis
language as well as dictation language; it does not translate the reply text. Changing language,
starting dictation, sending a new request, disabling read-aloud, or leaving the chat stops playback.
Unsupported browsers keep the speaker disabled. Voices depend on the browser and operating system.
See [MDN SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance).

Ask “what things can I do?” for a concise capability explanation without executing an action.
Informational replies use `answered`, separate from `executed` and `unresolved`. Help is rendered from operation descriptions in ordinary English, rather than model-written prose. The completion binding narrows its description to match the exposed completed-only behavior. Technical identifiers stay in invocation payloads.

The usual application URL is `http://localhost:3001`; set `PORT=3003` to use another port.
`TODO_LLM_URL` optionally changes the Ollama server base URL (default `http://127.0.0.1:11434`).
Without `TODO_LLM_MODEL`, the assistant is hidden and interpretation reports that it is disabled.
The model name and URL are server configuration, not client input. Model data stays with that
configured provider; use local, disposable Todo data for this spike.

The UI sends `POST /model/commands` with `{text}`. `ontahiExpress` mounts this optional
runtime entry and propagates the authenticated invocation context. There are no chat operations
on `TodoList`, no chat-specific application capability, and no domain service delegation loop.

The boundaries are explicit:

- `operation.description`, input/output contracts, and requirements belong to the domain model.
  Core's `createModelCommandRuntime` resolves these declarations, interprets the request, reloads
  the scope, validates the canonical proposal, and dispatches the selected operation.
- `command-chat/runtime.ts` composes that runtime with the provider, authentication policy, and
  bounded context reader. It does not implement the orchestration itself.
- `command-chat/bindings.ts` contains the remaining application-specific argument projections,
  name-to-reference/selection bindings, scope validation, and result messages. It does not duplicate
  operation descriptions. This explicit exposure configuration is not automatic graph-scope inference.
- `context.ts` reads through Graph Read policies and passes visible list names and unfinished item
  titles/list names to the model. Limits are 100 lists, 100 items, 24,000 serialized context
  characters, and 2,000 request characters. IDs and Selection syntax stay in the runtime.
- `model-provider.ts` adapts Ollama to Core's provider contract without importing Todo.

There is no list selector or Todo-specific focus input. `complete banana` searches all visible
unfinished items. A unique match can be completed directly; ambiguous matches request a title and
list, for example `complete banana in Groceries`. Creating an item requires a named list, such as
`add banana to Groceries`. Other examples: `create list Groceries` and `delete list Groceries`.
The binding only uses a list qualifier when that list name occurs in the user's message (matching
whole normalized words). An invented qualifier cannot disambiguate duplicate titles; absent a
named list, completion resolves globally. This conservative example policy is not general natural
language reference resolution or an authorization boundary.

Deletion uses the existing `TodoItem.deleteList`, including its item cascade. Each request
still produces at most one invocation; general graph questions and conversation continuation
remain follow-ups.

The provider uses the [Ollama chat API](https://docs.ollama.com/api/chat) with
[structured output](https://docs.ollama.com/capabilities/structured-outputs), one request and a
60-second timeout. GitHub authentication mode requires sign-in before context disclosure.

The real-model integration evaluation runs explicitly against disposable in-memory data:

```sh
TODO_STORAGE=in-memory TODO_AUTH_MODE=disabled TODO_LLM_MODEL=qwen3.5:0.8b \
  pnpm --filter @ontahi/example-todo-express exec tsx src/command-chat/commands.evaluation.ts
```

`commands.evaluation.ts` is a test, not application startup code. It checks item creation/completion,
duplicate and missing targets, list creation, named-list deletion, and item
creation in a named list. The evaluation also reproduces `delete list Nueva` and checks that a two-list deletion is
unresolved without effects. The suite also checks unique, ambiguous, and explicitly qualified banana completion. These twelve cases pass with qwen3.5:0.8b; its explanations
remain variable. Ordinary suites use deterministic providers. Broader reliability remains in
[plan 153](../../plans/current/153-model-backed-todo-command-spike.md).

The runtime rechecks context before dispatch, but this is not a transaction spanning inference and
execution or a production security guarantee. Conversation continuation, cross-surface session
context, prompt-injection hardening, provider disclosure policy, and stronger authorization/effect
binding are explicitly tracked follow-ups. See plans 153a–153c.

The Ollama adapter sends context data and the actual user instruction as separate messages.
Single-list deletion extracts `name` from natural language. Batch requests are still outside the
one-invocation contract and should request separate messages; prompt guidance and the small-model
evaluation do not guarantee correct intent recognition for arbitrary compound requests.
