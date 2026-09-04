# @ontahi/runtime-express

Express runtime adapters for Ontahi applications.

See [Application Data Access](../../docs/application-data-access.md) for the complete path from
Entity policy through generated React Queries, Relationship Commands, and Operations. The
canonical [transport chapter](../../docs/developers/03-runtimes/03-transport-and-http-ingress.md)
places those paths in the wider application model.

Mount a complete Ontahi application with one middleware:

```ts
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';
import {
  createRuntimeProtocolDispatcher,
  toDurableOperationSnapshotResponse,
} from '@ontahi/core/runtime/protocol';

type RuntimeAuthority = { principal: ReturnType<typeof authenticate> };

const runtimeDispatcher = createRuntimeProtocolDispatcher<RuntimeAuthority>({
  handlers: {
    operation: (request, authority) =>
      TodoApplication.app.runtime.withInvocationContext(authority, () =>
        operationDispatcher(request),
      ),
    'graph.read': (request, authority) => graphReadDispatcher(request, { authority }),
    'graph.command': (request, authority) => graphCommandDispatcher(request, { authority }),
    'durable.operation': async request =>
      toDurableOperationSnapshotResponse(await TodoApplication.getTaskSnapshot(request.run)),
  },
});

server.use(
  ontahiExpress(TodoApplication, {
    mountPath: '/runtime/ontahi',
    runtimeProtocol: {
      dispatcher: runtimeDispatcher,
      context: request => ({ principal: authenticate(request) }),
    },
    explorer: createOntahiExpressExplorer(),
  }),
);
```

`mountPath` moves every Ontahi-owned route below one host-selected root. Without it, the root is
`/`. The mounted runtime above includes:

- `POST /runtime/ontahi/runtime` for Operation invocation and permission, Graph Read, Graph
  Command, and Durable Operation inspection through the handlers explicitly installed above.
- `POST /runtime/ontahi/operations`, `/graph/reads`, and `/graph/commands` as family-specific legacy
  routes when their existing adapters are configured and a client explicitly selects them.
- `GET /runtime/ontahi/operations/tasks/:taskId/:runId` as the legacy durable snapshot route.
- `GET /runtime/ontahi/application` for reflected application metadata.
- `/runtime/ontahi/explorer/*` when Explorer is enabled.

Pass `indexFile` to `createOntahiExpressExplorer(...)` to serve an embedded Explorer SPA from that
file. Paths remain configurable for hosts that need different conventions.

Explorer composition is an optional subpath. Installing the base Express runtime does not install
React, Monaco, or Explorer UI dependencies; hosts that import `@ontahi/runtime-express/explorer`
install `@ontahi/explorer-react` explicitly.

The Fetch client points every registered request/response family at the mounted Runtime Protocol
path:

```ts
const client = createFetchGraphClient({
  runtimeTransport: { endpoint: '/runtime/ontahi/runtime' },
});
```

During migration, a host can select a legacy route per family without changing the others:

```ts
const client = createFetchGraphClient({
  runtimeTransport: { endpoint: '/runtime/ontahi/runtime' },
  compatibility: {
    operation: { endpoint: '/runtime/ontahi/operations' },
    graphRead: { endpoint: '/runtime/ontahi/graph/reads' },
    graphCommand: { endpoint: '/runtime/ontahi/graph/commands' },
  },
});
```

Compatibility is selected before sending. There is no automatic `/runtime`-to-legacy fallback or
replay after an ambiguous failure.

`runtimeProtocol` is optional and default-deny by composition: the adapter does not invent a
Durable handler or authorization policy. It validates the portable envelope before deriving
trusted request context and dispatches only the family handlers installed by the host. Each family
adapter above passes that server-derived value into its canonical dispatcher; the portable request
never carries policies or authority.

The same dispatcher can be projected as a WebSocket session on a host-owned HTTP server:

```ts
import { createServer } from 'node:http';
import { createPollingDurableOperationObserver } from '@ontahi/core/runtime/protocol';
import { createExpressRuntimeProtocolWebSocketServer } from '@ontahi/runtime-express/runtime-protocol';

const httpServer = createServer(server);

createExpressRuntimeProtocolWebSocketServer({
  server: httpServer,
  path: '/runtime/ontahi/runtime',
  dispatcher: runtimeDispatcher,
  authorizeUpgrade: request => {
    const origin = request.headers.origin;
    return Boolean(origin && request.headers.host && new URL(origin).host === request.headers.host);
  },
  context: async request => ({ principal: await authenticateUpgrade(request) }),
  observeDurableOperation: createPollingDurableOperationObserver({
    inspect: run => TodoApplication.getTaskSnapshot(run),
  }),
});
```

The upgrade `context` is receiver-owned and runs once for the session; authority is never accepted
from a session frame. One connection carries all registered request/response families and pushed
Durable snapshots. The polling observer is an honest server-side compatibility adapter for Task
Runtimes that only expose inspection: it suppresses unchanged snapshots and never makes the browser
poll. Hosts with a native task observer can supply that `AsyncIterable` directly. Unsubscribe and
disconnect abort active iterators. The session does not promise replay, automatic resubscription,
or exactly-once snapshot delivery.

Browser WebSockets send matching cookies during the HTTP upgrade but do not use CORS as an access
control boundary. A credentialed host should use `authorizeUpgrade` to validate the browser
`Origin` against its canonical public origin before `context` restores the shared HTTP session.
The callback is optional because non-browser clients and reverse-proxy deployments need
host-specific trust rules; when supplied, `false` or an exception fails closed with `403`. Deploy
over TLS (`wss:`), use a production session store, and close or revalidate long-lived sessions when
logout, revocation, or permission changes must take effect immediately. The context is a snapshot
for one socket, not a substitute for application authorization.

There is no global route discovery. A mount root is host and deployment configuration, so each
client runtime receives it explicitly. This also allows more than one Ontahi application to coexist
under different roots.

The host can derive an Ontahi invocation context from each Express request. This keeps Passport,
Auth0, Okta, or another authentication mechanism outside the adapter:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    invocationContext: request => ({
      principal: request.user ? toPrincipal(request.user) : null,
    }),
  }),
);
```

The callback may be asynchronous. It runs once for each Operation invocation, permission check, or
graph read; the returned Principal and resource map remain scoped to that request. Future remote
Commands use the same invocation context rather than introducing another request-identity hook.

Graph reads are separately opt-in and default-deny. The host installs explicit Entity policies,
while the application supplies the graph runtime already configured by `ontahi({ storage, ... })`:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    invocationContext: request => ({
      principal: request.user ? toPrincipal(request.user) : null,
    }),
    graphRead: {
      policies: todoGraphReadPolicies,
    },
  }),
);
```

Without `graphRead`, no graph-read route exists. Its default path is `/graph/reads` relative to the
mount root and can be replaced with `graphRead.path`. Authority in the request body is ignored. By
default policies receive the resolved invocation context. An application with a specialized tenant
or ownership authority can derive it explicitly without repeating authentication:

```ts
graphRead: {
  policies: tenantGraphReadPolicies,
  authority: (context, request) => ({
    principal: context.principal,
    tenantId: requireTenantId(request),
  }),
}
```

`graphRead.dispatcher` and `graphRead.context` remain available as a lower-level transport
composition seam. Ordinary applications should pass policies and let Ontahi build the dispatcher
from the application storage runtime.

Graph Commands are likewise opt-in and default-deny. An Entity mutation policy names the exact
actions, writable Fields, and result Fields. When Explorer is mounted beside that policy, its
snapshot reflects those static affordances so the instance canvas can expose inline editing and
exact-row delete. The snapshot is advisory UI metadata; every submitted Command is rebuilt and
authorized again by the dispatcher.

Operation-declared HTTP ingress can be mounted from the same middleware:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    mountPath: '/runtime/ontahi',
    ingress: {
      providers: {
        'github-webhook': createGitHubWebhookIngressProvider({
          getSecret: requireGitHubWebhookSecret,
        }),
      },
    },
  }),
);
```

The adapter reads the reflected routes, uses the canonical operation dispatcher, and preserves the
raw body for provider verification. Mount this middleware before host-wide body parsers when ingress
providers verify signatures. `ingress.bodyLimit` customizes the raw-body limit.

Provider registries and ingress routing remain transport-neutral core contracts. A future Koa or
other HTTP adapter can consume the same providers while owning its framework-specific request and
response conversion.

The lower-level Operation invocation, Graph Read, Graph Command, legacy Task snapshot, and Runtime
Protocol handlers remain available for explicit compatibility or custom transport composition.
