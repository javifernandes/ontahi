# `@ontahi/explorer-react`

Headless contracts, reflected descriptors, and React surfaces for exploring an Ontahi application.

The canonical [Reflection and Explorer](../../docs/developers/04-reflection-and-clients/01-reflection-and-explorer.md)
chapter explains semantic Ref links, read-only Relation topology, Query-backed related instances,
and the authority boundary. This README is the package-level reference.

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

`ExplorerEntityBrowser` is instance-first when the host registers a reflected Entity data reader:
the selected Entity opens on its rows, a searchable dropdown switches Entities without consuming a
permanent sidebar, Operations appear as contextual Actions, and Schema remains available as a
secondary floating affordance. The surface intentionally omits a title and explanatory hero copy.
Hosts without a reflected reader continue to open on the reflected Entity structure. Explicit
`structure`, `operations`, and `data` tab routes remain supported for deep links.

When the server snapshot reflects an authorized Entity mutation policy and the React graph client
can execute Commands, allowed scalar Fields become editable inline and deletable rows receive an
explicit destructive action. Explorer sends canonical identity-scoped Entity Mutation Commands and
re-reads the table after success; descriptors only control presentation, while the server policy
remains authoritative.
