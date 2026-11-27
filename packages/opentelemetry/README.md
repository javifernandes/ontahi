# @ontahi/opentelemetry

OpenTelemetry implementation of Ontahi's vendor-neutral server telemetry port.

The package creates and annotates spans through `@opentelemetry/api`. The host remains responsible for registering an OpenTelemetry SDK, resource attributes, processors, and OTLP exporters.

```ts
import { createOpenTelemetryServerRuntimeTelemetryAdapter } from '@ontahi/opentelemetry';
import { configureServerRuntime } from '@ontahi/core/runtime/server';

const telemetry = createOpenTelemetryServerRuntimeTelemetryAdapter({
  tracerName: 'my-app.server',
});
configureServerRuntime({ telemetry });
```

Runtime attributes use the `ontahi.*` namespace. Service identity, deployment environment, version, and exporter destinations belong to host resource configuration.

Start the host SDK with a context manager before handling requests. Core emits spans for
Operations, Units of Work, logical reads and commands, transactions, and model attempts.
Supported Task storage persists the enqueue trace context and execution ordinal so a worker can
link its attempt span to the original enqueue. Apply the updated Task schema when using PostgreSQL.
Database and HTTP client instrumentation belongs to the host, including redaction of SQL and URLs.
