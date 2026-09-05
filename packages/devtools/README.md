# `@ontahi/devtools`

Experimental, development-only diagnostics for Ontahí web clients.

The package currently provides a bounded in-memory diagnostic store, a compositional
`RuntimeTransport` instrument, and an opt-in React panel. The panel leads with application intent,
keeps transport families as supporting metadata, and lets each request and response move between a
semantic projection, body JSON, and its complete Runtime Protocol envelope. It does not patch
`fetch`, `WebSocket`, or browser globals, and it does not persist or upload diagnostic data.

```tsx
import { createOntahiDiagnostics, instrumentRuntimeTransport } from '@ontahi/devtools';
import { OntahiDevtools } from '@ontahi/devtools/react';

const diagnostics = createOntahiDiagnostics();
const transport = instrumentRuntimeTransport({
  diagnostics,
  id: 'http',
  kind: 'fetch',
  transport: runtimeTransport,
});

<OntahiDevtools
  diagnostics={diagnostics}
  settings={<RuntimeTransportControls controller={hostOwnedRoutingController} />}
/>;
```

The optional `settings` slot keeps routing policy and controls host-owned while presenting them in
a dedicated Devtools view. Changing a setting must follow the host transport contract; Devtools
does not replay requests or move an active observation between transports.

Payload capture is disabled by default. Enabling it requires a host-owned redactor:

```ts
createOntahiDiagnostics({
  capturePayloads: true,
  redact: value => removeApplicationSecrets(value),
});
```

This first release proves the behavioral boundary in Todo. Cache inspection and transport
connection state are later Plan 148 slices.
