# @ontahi/react

Non-visual React integration for Ontahi applications.

This package depends on `@ontahi/core`. It owns React hooks and bridge adapters that are generic to React clients:

1. `@ontahi/react/actions`: action execution hooks, React Query integration, and operation bridge adapters.
2. `@ontahi/react/graph`: graph runtime provider, client cache hooks, and operation bridge adapter lookup hooks.

The generic action metadata and result protocol comes from `@ontahi/core/runtime/actions`; Next.js-specific transport remains in `@ontahi/runtime-nextjs`.

Application-specific graph declarations, domain entities, runtime assembly, and policy stay in the
host application. Reusable reflective UI lives in `@ontahi/explorer-react`; hosts contribute their
own routes, access control, theme/auth composition, and application-specific UI enrichments.
