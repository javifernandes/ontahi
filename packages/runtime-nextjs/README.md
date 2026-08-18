# @ontahi/runtime-nextjs

Next.js runtime adapters for Ontahi applications.

See [Application Data Access](../../docs/application-data-access.md) for the shared Query, policy,
client View, and React model before choosing the Next.js route adapter below.

This package depends on `@ontahi/core` and owns the Next.js / `next-safe-action` transport layer. It currently contains:

1. `@ontahi/runtime-nextjs/actions`: compatibility re-exports for generic action runtime metadata and result helpers from `@ontahi/core/runtime/actions`.
2. `@ontahi/runtime-nextjs/actions/server`: server-only `next-safe-action` transport and feature action factory helpers.
3. `@ontahi/runtime-nextjs/operation-invocation`: an App Router `Request`/`Response` adapter for the transport-neutral operation invocation protocol from `@ontahi/core`.
4. `@ontahi/runtime-nextjs/graph-read`: an App Router adapter for policy-scoped remote data graph reads.

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

## Data graph reads

Create one dispatcher from the server application and its explicit read policies, then export the
handler from an App Router Route Handler such as `app/api/graph/reads/route.ts`:

```ts
import { createNextGraphReadRouteHandler } from '@ontahi/runtime-nextjs/graph-read';

import { TodoApplication } from '@/application';
import { todoReadPolicies } from '@/todo-read-policies';
import { resolvePrincipal } from '@/authentication';

const dispatcher = TodoApplication.createGraphReadDispatcher(todoReadPolicies);

export const POST = createNextGraphReadRouteHandler({
  dispatcher,
  invocationContext: async request => ({
    principal: await resolvePrincipal(request),
  }),
});
```

Policies using a specialized authority can derive it only from the trusted invocation context and
request metadata:

```ts
export const POST = createNextGraphReadRouteHandler({
  dispatcher,
  invocationContext,
  authority: context => ({ ownerId: context.principal?.subject }),
});
```

Malformed graph programs return `400`, denied reads return `403`, unavailable execution returns
`503`, and successful reads return `200`. Caller-provided authority in the request body is never
used to authorize dispatch.
