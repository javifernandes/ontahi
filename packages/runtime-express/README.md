# @ontahi/runtime-express

Express runtime adapters for Ontahi applications.

Mount a complete Ontahi application with one middleware:

```ts
import { ontahiExpress } from '@ontahi/runtime-express';

server.use(
  ontahiExpress(TodoApplication, {
    explorer: true,
  }),
);
```

The default mount includes:

- `POST /operations` for invocation and permission checks.
- `GET /operations/tasks/:taskId/:runId` for durable task snapshots.
- `GET /application` for reflected application metadata.
- Explorer snapshot and reflected entity data endpoints when `explorer` is enabled.

Pass `explorer: { indexFile }` to serve an embedded Explorer SPA from that file. Paths remain
configurable for hosts that need different conventions.

The lower-level operation invocation and task snapshot handlers remain available for custom
transport composition.
