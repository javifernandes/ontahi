# 159. Next.js Application Runtime Mount

Status: current

## Summary

Let a Next.js host mount an asynchronously composed Ontahí application Runtime Protocol without
rebuilding family dispatch or retaining legacy per-family routes. Use Atlas as the external proof:
its browser client should send Operations through `/runtime`, its `/operations` compatibility route
should disappear, and its App Router boundary should inject trusted context rather than implement
application authorization.

## Context

The unified Fetch Runtime client already routes Operations, Graph Reads, Graph Commands, and
Durable inspection through `/runtime`. The Next.js adapter already accepts an
`ApplicationRuntimeProtocol` receiver, but only as an eagerly available value. Real Next.js hosts
often compose storage-backed applications lazily and asynchronously, which pushes them back toward
an application-local dispatcher and legacy `/operations` route.

Atlas exposed the resulting rough edge while adding Workspace ownership. Its route rebuilt the
Operation family manually, filtered bridge exposure locally, and duplicated authorization before
entering Ontahí. This is framework plumbing, not Atlas product behavior.

## Scope

1. Allow the Next.js Runtime Protocol adapter to resolve its receiver asynchronously per request,
   after protocol validation.
2. Ensure the application Runtime Protocol exposes only Operations declared with bridge exposure.
3. Document lazy application mounting and the unified Fetch client path.
4. Prove the released artifacts in Atlas by removing `/operations` and its custom family dispatcher.

## Non-goals

1. Ontahí does not own host authentication, cookies, Workspace lookup, or authorization policy.
2. Do not infer Graph Read or Command policies from Entity declarations.
3. Do not remove the public legacy family adapters in this release.
4. Do not introduce another protocol or a second Next.js application abstraction.

## Proposed form

```ts
export const POST = createNextRuntimeProtocolRouteHandler({
  receiver: async () => (await getApplication()).runtimeProtocol,
  context: request => resolveTrustedContext(request),
});
```

The application composition owns `createApplicationRuntimeProtocol(...)`, including policy and
Operation exposure. The Next.js route owns only transport projection and trusted context creation.

## Execution slices

1. [x] Add lazy receiver resolution and focused Next.js adapter coverage.
2. [x] Fail closed for server-only Operations in the application Runtime Protocol.
3. [x] Update public guidance and durable Runtime Protocol form.
4. [x] Add Changesets and verify the affected package artifacts.
5. [ ] Migrate Atlas to the unified Runtime client and validate the released external consumer.

## Acceptance checklist

- [x] Invalid protocol input never initializes the application receiver or authentication context.
- [x] A lazy receiver dispatches the same canonical response as an eager receiver.
- [x] Receiver initialization failures produce a correlated `dispatch_unavailable` response.
- [x] A server-only Operation cannot be invoked through the application Runtime Protocol.
- [x] Atlas has no `/operations` route or custom Runtime-to-Operation dispatcher in the packed-artifact
      consumer proof.
- [x] Atlas browser Operations use the common `/runtime` transport in the packed-artifact consumer
      proof.
- [ ] Focused tests, package verification, and Atlas verification pass.

## Durable model impact

This plan refines [[ontahi.runtime-protocol|Ontahí Runtime Protocol]] mounting rather than adding a
new runtime concept. Framework adapters may resolve a composed receiver lazily; application policy
and bridge exposure remain authoritative below transport.

## Closure / Evolution

Checkpoint (2026-10-26): the framework implementation, package tests, typechecks, lint, reproducible
artifact packing, and Atlas packed-artifact migration pass. Final closure waits for the published
version and Atlas verification against that exact registry release.

Open. The expected follow-up is to move Atlas Workspace membership from route guards into Runtime
Protocol Graph policies and Operation requirements once its Workspace queries and mutations exist.
