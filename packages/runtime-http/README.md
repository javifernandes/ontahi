# `@ontahi/runtime-http`

HTTP transport adapters for Ontahí runtimes.

The first adapter lowers Core's transport-neutral managed Event egress attempt to one HTTP `POST`.
It sends stable Event, occurrence, subscription, delivery, attempt, and idempotency headers; signs
the exact transmitted JSON bytes when configured; and normalizes retryable HTTP outcomes for the
Core processor.

```ts
import { processNextEventEgressDelivery } from '@ontahi/core/runtime/server';
import { createHttpEventEgressTransport } from '@ontahi/runtime-http';

const transport = createHttpEventEgressTransport({ defaultTimeoutMs: 10_000 });

await processNextEventEgressDelivery({
  runtime: eventRuntime,
  subscription,
  consumerId: 'webhook-worker-1',
  leaseMs: 30_000,
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
and timeouts are retryable. Other statuses throw `HttpEventEgressRejectedError`, so Core releases
the claim without pretending the terminal policy has been decided.
