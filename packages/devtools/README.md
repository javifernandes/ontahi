# `@ontahi/devtools`

Experimental, development-only diagnostics for Ontahí web clients.

The package currently provides a bounded in-memory diagnostic store, a compositional
`RuntimeTransport` instrument, and an opt-in React panel. The panel leads with application intent,
keeps transport families as supporting metadata, and lets each request and response move between a
semantic projection, body JSON, and its complete Runtime Protocol envelope. It does not patch
`fetch`, `WebSocket`, or browser globals, and it does not persist or upload diagnostic data.

```tsx
import { createRuntimeTransportRouter } from '@ontahi/core/runtime/protocol';
import { createOntahiDiagnostics, instrumentRuntimeTransport } from '@ontahi/devtools';
import { OntahiDevtools } from '@ontahi/devtools/react';
import { createFetchRuntimeTransport, createWebSocketRuntimeTransport } from '@ontahi/react/graph';

const diagnostics = createOntahiDiagnostics();
const runtimeTransport = createRuntimeTransportRouter({
  transports: {
    http: instrumentRuntimeTransport({
      diagnostics,
      id: 'http',
      kind: 'fetch',
      transport: createFetchRuntimeTransport(),
    }),
    websocket: instrumentRuntimeTransport({
      diagnostics,
      id: 'websocket',
      kind: 'websocket',
      transport: createWebSocketRuntimeTransport(),
    }),
  },
  routing: {
    'graph.read': 'websocket',
    'graph.command': 'websocket',
    operation: 'websocket',
    'durable.operation.observe': 'websocket',
  },
});

<OntahiDevtools diagnostics={diagnostics} runtimeTransport={runtimeTransport} />;
```

`createRuntimeTransportRouter(...)` owns effective routing, capability validation, inspection, and
subscription. Devtools recognizes that configurable Runtime Transport and owns its generic Settings
projection; applications do not provide settings UI, React state, or presets. Profiles are derived
from the registered transports and their supported capabilities. The host still chooses the
initial routing and may subscribe for application policies such as cache invalidation or local
persistence. Changing a setting never replays requests or moves an active observation between
transports.

`instrumentRuntimeTransport(...)` preserves and delegates this routing capability when it wraps a
configurable transport.

The default Visual detail projects Operation requests to their input and successful responses to
their returned value, flattening Entity Refs to their locator identity. Body JSON and Envelope keep
the complete Runtime Protocol evidence available when transport-level inspection is needed.

The React surface opens as a full-width bottom drawer at a compact default height. Drag its top
handle, or focus the handle and use the arrow keys, to resize it while the application remains
visible above.

Payload capture is disabled by default. Enabling it requires a host-owned redactor:

```ts
createOntahiDiagnostics({
  capturePayloads: true,
  redact: value => removeApplicationSecrets(value),
});
```

This first release proves the behavioral boundary in Todo. Cache inspection and transport
connection state are later Plan 148 slices.
