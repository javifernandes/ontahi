# `@ontahi/runtime-http`

HTTP transport adapters and a minimal Node host for Ontahí runtimes.

## HTTP ingress

`createHttpIngressHandler(...)` composes Operation and Event ingress behind one standard Web
`Request → Response` boundary. Express and Next.js delegate to this handler; applications that do
not need their framework facilities can host the same contract directly with `node:http`:

```ts
import { createNodeHttpIngressServer } from '@ontahi/runtime-http/node';

const server = createNodeHttpIngressServer({
  ingress: {
    providers,
    operations: {
      routes: application.graph.listHttpIngress(),
      dispatcher,
    },
    events: {
      routes: eventRoutes,
      events: application.events,
    },
  },
  bodyLimitBytes: 1024 * 1024,
});

server.listen(3000, '127.0.0.1');
```

The minimal server buffers only a bounded request body, preserves the raw provider request, returns
Web responses without an Express-shaped contract, and sanitizes unexpected failures. Applications
still own listening topology, TLS, shutdown, trusted proxy handling, authorization, and provider
registration. `createNodeHttpServer(...)` can host any other standard Ontahí HTTP handler.

The supported entrypoints are:

1. `@ontahi/runtime-http/ingress`: framework-neutral ingress composition;
2. `@ontahi/runtime-http/node`: the minimal `node:http` bridge;
3. `@ontahi/runtime-http/event-egress`: managed Event egress over Fetch;
4. `@ontahi/runtime-http`: the complete server-side surface.

## Managed Event egress

The first adapter lowers Core's transport-neutral managed Event egress attempt to one HTTP `POST`.
It sends stable Event, occurrence, subscription, delivery, attempt, and idempotency headers; signs
the exact transmitted JSON bytes when configured; and normalizes retryable HTTP outcomes for the
Core processor.

```ts
import { processNextEventEgressDelivery } from '@ontahi/core/runtime/server';
import { createHttpEventEgressTransport } from '@ontahi/runtime-http/event-egress';

const transport = createHttpEventEgressTransport({ defaultTimeoutMs: 10_000 });

await processNextEventEgressDelivery({
  runtime: eventRuntime,
  subscription,
  consumerId: 'webhook-worker-1',
  leaseMs: 30_000,
  retryDelayMs: 5_000,
  resolveDestination: async destinationId => destinations.require(destinationId),
  transport,
});
```

A resolved destination has this shape:

```ts
const customerWebhook = {
  url: 'https://customer.example/events',
  headers: { authorization: `Bearer ${token}` },
  timeoutMs: 5_000,
  signing: {
    kind: 'hmac-sha256',
    secret: signingSecret,
  },
} as const;
```

Destinations are trusted host configuration. The package does not register subscriptions, resolve
secrets, admit caller-provided URLs, schedule workers, retry internally, or persist attempt history.
It does not follow redirects. A `2xx` response is accepted; `408`, `429`, `5xx`, network failures,
and timeouts are retryable. Other statuses are classified as rejected so Core can persist a
terminal failure through the configured durable Event Runtime.
