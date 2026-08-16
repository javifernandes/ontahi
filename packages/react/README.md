# @ontahi/react

Non-visual React integration for Ontahi applications.

This package depends on `@ontahi/core`. It owns React hooks and bridge adapters that are generic to React clients:

1. `@ontahi/react/actions`: action execution hooks, React Query integration, and operation bridge adapters.
2. `@ontahi/react/graph`: graph runtime provider, client cache hooks, and operation bridge adapter lookup hooks.

The generic action metadata and result protocol comes from `@ontahi/core/runtime/actions`; Next.js-specific transport remains in `@ontahi/runtime-nextjs`.

Application-specific graph declarations, domain entities, runtime assembly, and policy stay in the
host application. Reusable reflective UI lives in `@ontahi/explorer-react`; hosts contribute their
own routes, access control, theme/auth composition, and application-specific UI enrichments.

Projectable Operations keep population on the server and shape in the caller:

```ts
const TripList = Trip.view('TripList', { id: true, driver: { name: true } });
const operation = Trip.domain.available.as(TripList);
const result = useOperationQuery(operation, input);
```

React cache identity includes the transported View AST. The View remains client-owned and does not
need a server registry entry.
