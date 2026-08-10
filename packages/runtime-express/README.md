# @ontahi/runtime-express

Express runtime adapters for Ontahi applications.

Mount a complete Ontahi application with one middleware:

```ts
import { ontahiExpress } from '@ontahi/runtime-express';

server.use(
  ontahiExpress(TodoApplication, {
    mountPath: '/runtime/ontahi',
    explorer: true,
  }),
);
```

`mountPath` moves every Ontahi-owned route below one host-selected root. Without it, the root is
`/`. The mounted runtime above includes:

- `POST /runtime/ontahi/operations` for invocation and permission checks.
- `GET /runtime/ontahi/operations/tasks/:taskId/:runId` for durable task snapshots.
- `GET /runtime/ontahi/application` for reflected application metadata.
- `/runtime/ontahi/explorer/*` when Explorer is enabled.

Pass `explorer: { indexFile }` to serve an embedded Explorer SPA from that file. Paths remain
configurable for hosts that need different conventions.

The Fetch bridge accepts the same mount root and derives both operation endpoints:

```ts
const bridge = createFetchOperationBridgeAdapter({
  mountPath: '/runtime/ontahi',
});
```

There is no global route discovery. A mount root is host and deployment configuration, so each
client runtime receives it explicitly. This also allows more than one Ontahi application to coexist
under different roots.

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
