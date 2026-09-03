# 130. Ontahi Authentication Principal And Invocation Context

Status: done

Canonical ID: `ontahi://plans/130-ontahi-authentication-principal-and-invocation-context`

Migrated from: `bookops://plans/130-ontahi-authentication-principal-and-invocation-context`
Original path: `plans/done/130-ontahi-authentication-principal-and-invocation-context.md`
Source commit: `f9e32aed`

Related plans:

1. [68e. Auth And Identity Requirement API](bookops://plans/68e-auth-and-identity-requirement-api)
2. [78. First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
3. [120. Ontahi Environment Resources And Semantic Bindings](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)
4. [128. Ontahi Data Graph Execution Bridge](ontahi://plans/128-ontahi-data-graph-execution-bridge)
5. [129. Ontahi Independent Repository And Release Readiness](./129-ontahi-independent-repository-and-release-readiness.md)

## Summary

Make the authenticated caller an explicit, provider-neutral Ontahi runtime value. A host such as
Express, Next.js, Passport, Supabase, Auth0, or Okta authenticates the request at its boundary and
supplies a canonical Principal to Ontahi. Domain operations consume that Principal without knowing
which transport, cookie, token, or identity provider produced it.

The first vertical slice lands in the independent Ontahi repository and is exercised by Todo
Express. BookOps remains a design and acceptance fixture while the API is moving; it migrates only
after a linked local compatibility pass and an Ontahi prerelease.

## Context

Ontahi already has most of the lower-level mechanics:

1. operation requirements run before operation bodies,
2. operation-scoped resources are inherited by nested operations,
3. `app.auth` and `app.require` accept host-provided capabilities,
4. the operation bridge shares one canonical invocation dispatcher,
5. Express and Next.js adapters receive a native request before dispatch.

The missing seam is explicit caller propagation. The dispatcher accepts only an operation and
input. Express therefore discards `request.user`, while BookOps resolves a Supabase `User` lazily
through ambient Next.js request state. Permission checks also allocate a new resource map instead
of sharing the invocation scope used by execution.

Plan 68e landed the application-facade direction and the BookOps/Supabase adapter, but did not
extract a provider-neutral authentication contract into public core. This plan owns that remaining
framework work.

## Research / Evidence

Current implementation evidence:

1. `packages/core/src/runtime/server/app-facade.ts` has an empty core auth facade.
2. `packages/core/src/runtime/server/operation/runner.ts` inherits parent operation resources.
3. `packages/core/src/runtime/server/domain-operations.ts` creates fresh permission resources.
4. `packages/runtime-express/src/operation-invocation/handler.ts` sees the Express request but sends
   only the protocol request to the dispatcher.
5. `web/src/architecture/runtime/auth-resources.ts` caches a Supabase `User` in operation resources.
6. `web/src/platform/auth/server.ts` resolves the user through `supabase.auth.getUser()`.
7. Todo Express currently has no authentication or protected operation.

Authentication and authorization remain separate:

```text
authentication: request/session/token -> Principal
authorization: Principal + action + resource + context -> decision
```

Plan 78 continues to own authorization policy, relationship facts, roles, and permission decisions.

## Scope

1. Define a minimal provider-neutral Principal.
2. Introduce an invocation context that can carry the Principal and shared scoped resources.
3. Expose current/required Principal APIs and a standard authenticated requirement.
4. Make execution and permission checks observe the same invocation context.
5. Let runtime-express derive invocation context from an Express request without depending on
   Passport.
6. Exercise the boundary in Todo Express with Passport and a free OAuth provider.
7. Validate the resulting API against BookOps using sibling development before publishing.
8. Publish through Changesets, then migrate BookOps to the exact released package versions.

## Non-Goals

1. Do not introduce roles, permissions, ownership, CASL, OpenFGA, or relationship policies.
2. Do not make Ontahi validate Passport sessions, Supabase cookies, OAuth tokens, or JWTs.
3. Do not make provider profile attributes part of the canonical Principal.
4. Do not redesign BookOps profiles, contacts, feature-flag identity, or sign-in UI.
5. Do not define durable-task Principal propagation in the first slice.
6. Do not require Passport, Supabase, Auth0, or Okta as core or runtime-express dependencies.

## Proposed Form

The canonical value is intentionally narrow:

```ts
type Principal = {
  subject: string;
  kind: 'user' | 'service';
  issuer?: string;
};
```

Unauthenticated execution is represented by `null`, not an anonymous Principal. Provider users,
sessions, access tokens, refresh tokens, and claims remain private host resources.

Application code should be able to use:

```ts
app.auth.currentPrincipal();
app.auth.requirePrincipal();
app.require.authenticated();
```

Plain Node execution and transports should enter the same scope:

```ts
app.runtime.withInvocationContext({ principal }, () =>
  TodoItem.complete(TodoItem.refById('todo-123')),
);
```

Express supplies the Principal without Ontahi knowing Passport:

```ts
server.use(
  ontahiExpress(TodoApplication, {
    invocationContext: request => ({
      principal: request.user ? toPrincipal(request.user) : null,
    }),
  }),
);
```

The exact names may move during implementation, but the direction is fixed: the host authenticates,
the runtime carries a Principal, and operations declare authentication independently from transport.

## Execution Slices

### Slice 1: Core Principal And Invocation Scope

1. Add Principal and invocation-context contracts.
2. Add scoped context entry for plain Node callers and transport adapters.
3. Share invocation resources across operation execution and permission checks.
4. Add core auth facade methods and the authenticated requirement.

### Slice 2: Express Boundary

1. Add a generic request-to-invocation-context hook to runtime-express.
2. Preserve unauthenticated behavior when no hook is configured.
3. Cover authenticated execution, unauthenticated rejection, and permission checks.

### Slice 3: Todo Passport Exercise

1. Configure Passport in the Todo host, not in Ontahi core.
2. Use GitHub OAuth as the first external provider and a test strategy for automated coverage.
3. Keep at least one operation public and protect at least one mutation.
4. Show the authenticated Principal in the example without promoting provider profile fields into
   core.

### Slice 4: BookOps Linked Acceptance

1. Map the current Supabase user to the canonical Principal at the Next.js transport boundary.
2. Run BookOps locally against the sibling Ontahi source.
3. Record API gaps before releasing; do not merge the linked dependency state.
4. Preserve BookOps' full Supabase user as an application-specific resource during migration.

### Slice 5: Release And Consumer Migration

1. Add a Changeset for the affected Ontahi packages.
2. Publish the prerelease through the trusted-publisher workflow.
3. Replace sibling linkage with exact registry versions in BookOps.
4. Run the existing versioned-consumer and BookOps compatibility gates before merging.

## Acceptance Checklist

- [x] Core exposes a provider-neutral Principal without provider tokens or profile payloads.
- [x] Plain Node callers can establish an invocation Principal explicitly.
- [x] Nested operations, execution, and permission checks observe one invocation scope.
- [x] `app.auth.currentPrincipal()`, `app.auth.requirePrincipal()`, and
      `app.require.authenticated()` are available without host wiring.
- [x] runtime-express maps `Request` to invocation context without a Passport dependency.
- [x] Existing public/unauthenticated applications continue to work unchanged.
- [x] Todo Express demonstrates public and authenticated operation paths with Passport.
- [x] Core, runtime-express, and Todo tests cover success and rejection paths.
- [x] Todo passes a real HTTP smoke test in explicit public mode.
- [x] Todo passes a real GitHub OAuth login and protected invocation smoke, with logout and
      invalid-state rejection covered by integration tests.
- [x] BookOps passes the authentication acceptance path against the exact published packages; this
      stronger registry proof superseded the planned sibling-only checkpoint.
- [x] A Changeset describes the public package changes.
- [x] BookOps consumes every Ontahi dependency at exact `0.1.0-alpha.3` versions before its
      migration merges.
- [x] Atlas distinguishes authentication/Principal resolution from authorization policy.

## Verification

1. Run core tests, typecheck, lint, and format checks.
2. Run runtime-express tests, typecheck, lint, and format checks.
3. Run Todo Express tests and manually exercise its login/protected-operation flow.
4. Run the Ontahi aggregate CI-equivalent checks.
5. Run BookOps sibling-development and exact-version consumer checks in their respective slices.

## Decisions

1. Use Principal for the authenticated caller; reserve Entity identity for Ontahi refs and locators.
2. Authentication belongs to the host boundary plus Ontahi invocation context.
3. Authorization consumes a Principal but remains a separate capability and plan.
4. Provider-specific users remain host/application resources.
5. Todo shapes the independent API; BookOps is a pre-release acceptance fixture, not a parallel
   refactor while the core surface is unstable.

## Open Questions

1. Should Principal kinds expand beyond the initial closed `user | service` set after another host
   proves a concrete need?
2. How should an authenticated Principal be captured when a durable task crosses process boundaries?

## Closure / Evolution

The independent framework slice settled on `withInvocationContext`. Todo protects
`TodoItem.complete` while keeping its reads and other mutations public, and its Passport/GitHub host
maps `request.user` through runtime-express without leaking Passport into Ontahi packages.

Todo composes two explicit run modes rather than degrading silently when credentials are absent.
Public mode leaves completion public; GitHub mode requires all OAuth/session configuration, mounts
Passport, and protects the same operation through Ontahi's standard requirement. Both manual smoke
tests are release evidence.

BookOps now maps its Supabase user to the canonical Principal at the Next.js operation-invocation
boundary. The same invocation context seeds the full Supabase `User` as a private host resource, so
existing BookOps requirements reuse the authenticated user without a second provider lookup. The
application consumes the exact published `0.1.0-alpha.3` package set.

## Closure

- Status: done
- Landed in: Ontahi `0.1.0-alpha.3` and the BookOps alpha.3 consumer migration
- Closed on: 2026-08-15
- Effective effort: ~1 day across design, Todo proof, release, and consumer migration
- Follow-ups:
  - [`130a. Durable Principal Propagation`](ontahi://plans/130a-durable-principal-propagation)
  - [`78. First-Class Authorization And Relationship Policies`](bookops://plans/78-first-class-authorization-and-relationship-policies)
