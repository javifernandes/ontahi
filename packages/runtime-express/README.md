# @ontahi/runtime-express

Express runtime adapters for Ontahi applications.

Mount a complete Ontahi application with one middleware:

```ts
import { ontahiExpress } from '@ontahi/runtime-express';
import { createOntahiExpressExplorer } from '@ontahi/runtime-express/explorer';

server.use(
  ontahiExpress(TodoApplication, {
    mountPath: '/runtime/ontahi',
    explorer: createOntahiExpressExplorer(),
  }),
);
```

`mountPath` moves every Ontahi-owned route below one host-selected root. Without it, the root is
`/`. The mounted runtime above includes:

- `POST /runtime/ontahi/operations` for invocation and permission checks.
- `POST /runtime/ontahi/graph/reads` when an explicit graph-read dispatcher is configured.
- `GET /runtime/ontahi/operations/tasks/:taskId/:runId` for durable task snapshots.
- `GET /runtime/ontahi/application` for reflected application metadata.
- `/runtime/ontahi/explorer/*` when Explorer is enabled.

Pass `indexFile` to `createOntahiExpressExplorer(...)` to serve an embedded Explorer SPA from that
file. Paths remain configurable for hosts that need different conventions.

Explorer composition is an optional subpath. Installing the base Express runtime does not install
React, Monaco, or Explorer UI dependencies; hosts that import `@ontahi/runtime-express/explorer`
install `@ontahi/explorer-react` explicitly.

The Fetch bridge accepts the same mount root and derives both operation endpoints:

```ts
const bridge = createFetchOperationBridgeAdapter({
  mountPath: '/runtime/ontahi',
});
```

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

The callback may be asynchronous. It runs once for each operation invocation or permission check;
the returned Principal and resource map remain scoped to that request.

Graph reads are separately opt-in and default-deny. The host installs explicit Entity policies,
provides the transport-neutral dispatcher, and derives graph authority from trusted request state:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    graphRead: {
      dispatcher,
      context: request => ({
        authority: { principal: request.user ? toPrincipal(request.user) : null },
      }),
    },
  }),
);
```

Without `graphRead`, no graph-read route exists. Its default path is `/graph/reads` relative to the
mount root and can be replaced with `graphRead.path`. Authority in the request body is ignored; only
the context factory can supply it.

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

The lower-level operation invocation and task snapshot handlers remain available for custom
transport composition.
