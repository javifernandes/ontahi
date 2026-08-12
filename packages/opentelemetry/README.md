# @ontahi/opentelemetry

OpenTelemetry implementation of Ontahi's vendor-neutral server telemetry port.

The package creates and annotates spans through `@opentelemetry/api`. The host remains responsible for registering an OpenTelemetry SDK, resource attributes, processors, and OTLP exporters.

```ts
import { createOpenTelemetryServerRuntimeTelemetryAdapter } from '@ontahi/opentelemetry';

const telemetry = createOpenTelemetryServerRuntimeTelemetryAdapter({
  tracerName: 'my-app.server',
});
```

Runtime attributes use the `ontahi.*` namespace. Service identity, deployment environment, version, and exporter destinations belong to host resource configuration.
