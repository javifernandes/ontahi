# `@ontahi/explorer-react`

Headless contracts, reflected descriptors, and React surfaces for exploring an Ontahi application.

The browser package exports the Explorer shell and focused components:

```tsx
import { ExplorerOverview, ExplorerShell } from '@ontahi/explorer-react';

export const Explorer = ({ snapshot }) => (
  <ExplorerShell basePath='/explorer'>
    <ExplorerOverview snapshot={snapshot} />
  </ExplorerShell>
);
```

Server adapters consume the framework-neutral descriptor builders through the `server` subpath:

```ts
import { buildExplorerSnapshot } from '@ontahi/explorer-react/server';
```

React, ReactDOM, TanStack Query, and Lucide remain host peers. Monaco is owned by this package
because the JSON operation editor is part of the provided Explorer UI.
