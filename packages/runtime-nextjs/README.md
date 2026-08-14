# @ontahi/runtime-nextjs

Next.js runtime adapters for Ontahi applications.

This package depends on `@ontahi/core` and owns the Next.js / `next-safe-action` transport layer. It currently contains:

1. `@ontahi/runtime-nextjs/actions`: compatibility re-exports for generic action runtime metadata and result helpers from `@ontahi/core/runtime/actions`.
2. `@ontahi/runtime-nextjs/actions/server`: server-only `next-safe-action` transport and feature action factory helpers.
3. `@ontahi/runtime-nextjs/operation-invocation`: an App Router `Request`/`Response` adapter for the transport-neutral operation invocation protocol from `@ontahi/core`.

New generic consumers should import action metadata and result helpers from `@ontahi/core/runtime/actions`. React hooks and operation bridge adapters live in `@ontahi/react/actions` so this package can stay focused on Next.js runtime concerns.

The operation route can derive an Ontahi invocation context from each web request. Authentication
remains a host concern; the adapter receives only the resulting Principal:

```ts
const POST = createNextOperationInvocationRouteHandler({
  dispatcher,
  invocationContext: async request => ({
    principal: await resolvePrincipal(request),
  }),
});
```

The Principal and resource map remain scoped to that invocation and are visible to operation
requirements, execution, nested operations, and permission checks.
