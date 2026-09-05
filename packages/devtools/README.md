# `@ontahi/devtools`

Experimental, development-only diagnostics for Ontahí web clients.

The package currently provides a bounded in-memory diagnostic store, a compositional
`RuntimeTransport` instrument, and an opt-in React panel. It does not patch `fetch`, `WebSocket`, or
browser globals, and it does not persist or upload diagnostic data.

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

<OntahiDevtools diagnostics={diagnostics} />;
```

Payload capture is disabled by default. Enabling it requires a host-owned redactor:

```ts
createOntahiDiagnostics({
  capturePayloads: true,
  redact: value => removeApplicationSecrets(value),
});
```

This first release proves the behavioral boundary in Todo. Cache inspection, transport connection
state, and mutable routing settings are later Plan 148 slices.
