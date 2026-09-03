# 146g. Unified Fetch Runtime Protocol Clients

Status: done

Parent plan: [146. Ontahí Runtime Protocol](../current/146-ontahi-runtime-protocol.md)

Predecessor:
[146f. Next.js Runtime Protocol Adapter](./146f-nextjs-runtime-protocol-adapter.md)

Canonical ID: `ontahi://plans/146g-unified-fetch-runtime-protocol-clients`

## Summary

Route the Fetch clients for Operation invocation and permission checks, Graph Read, Graph Command,
and Durable Operation inspection through one `RuntimeTransport` and one `/runtime` endpoint. Keep
application-facing Operation, Query, Entity Command, Relationship Command, and Durable Operation
ergonomics unchanged.

Preserve the current `/operations`, `/graph/reads`, and `/graph/commands` contracts as explicit,
bounded compatibility routes. Compatibility is a configured family choice, never an automatic
fallback after a common-protocol request: retrying an ambiguous Operation or Command against a
second endpoint could execute the same effect twice.

## Delivered Evidence

1. Core exposes `createRuntimeProtocolExchange`, which creates fresh request ids, constructs and
   correlates the common envelope, forwards abort and transport-local options, fails common errors
   closed, and performs exactly one `RuntimeTransport.request` call.
2. Operation invocation, permission checks, and reflected invocation use the versioned `operation`
   family by default while retaining their existing result and hook behavior. Successful void
   Operations omit their JavaScript-only `undefined` value at the portable response boundary.
3. Graph Read and Graph Command use `graph.read` and `graph.command` through the common transport;
   their existing family parsers continue to own semantic results, rejections, and errors.
4. `createFetchGraphClient` constructs one Fetch Runtime Transport and shares its endpoint, custom
   Fetch function, request initialization, credentials, headers, and correlation source across all
   four request/response families. Durable inspection remains transport-owned polling.
5. `compatibility.operation`, `compatibility.graphRead`, and `compatibility.graphCommand` select
   legacy unwrapped routes before transmission. Deprecated endpoint aliases remain supported, the
   compatibility object wins deterministically, and no network or HTTP failure triggers fallback.
6. One public-client conformance proof runs Graph Read, Graph Command, Operation invocation, and
   Durable inspection against both the Express and Next.js projections of the same dispatcher.
   The Todo Express host also proves receiver-derived Operation authority over `/runtime`.

## Delivered Form

The configuration makes the canonical and legacy paths unambiguous:

```ts
const client = createFetchGraphClient({
  runtimeTransport: {
    endpoint: '/runtime',
  },
});
```

During a bounded migration, a host may select legacy transport for individual families:

```ts
const client = createFetchGraphClient({
  runtimeTransport: {
    endpoint: '/runtime',
  },
  compatibility: {
    operation: { endpoint: '/operations' },
    graphRead: { endpoint: '/graph/reads' },
    graphCommand: { endpoint: '/graph/commands' },
  },
});
```

An explicitly listed family uses its legacy adapter. Every other supported family uses the common
Runtime Transport. There is no status-based or network-error fallback from one route to another.
Existing public endpoint options remain as deprecated aliases. An explicit `compatibility` family
entry takes precedence, as documented and tested.

## Scope

1. Inventory the current Fetch request construction, headers, credentials, custom `fetch`, request
   initialization, error mapping, and result parsing for Operation, Graph Read, and Graph Command.
2. Introduce one shared family exchange seam over `RuntimeTransport.request` that creates a unique
   exchange id, preserves common correlation, and hands the complete family body to its canonical
   response parser.
3. Adapt Operation invocation, permission checks, and reflected Operation invocation to the
   versioned `operation` family without changing hook or invoker result semantics.
4. Adapt remote Graph Read execution to `graph.read` and Graph Command execution to
   `graph.command` without duplicating Query compilation, command policy, or semantic rejection
   logic.
5. Keep Durable observation on the existing `durable.operation.inspect` Runtime Transport
   capability and remove duplicated Fetch configuration paths where possible.
6. Make `createFetchGraphClient` compose one Runtime Transport into all four families by default.
7. Preserve `/operations`, `/graph/reads`, and `/graph/commands` through explicit per-family legacy
   configuration with deterministic precedence and no automatic retry/fallback.
8. Add migration documentation, deprecation boundaries where appropriate, React Changeset, and
   representative Express and Next.js compatibility proofs.

## Non-Goals

1. No removal of legacy server routes or Next.js family-specific adapters in this slice.
2. No automatic fallback between `/runtime` and a legacy endpoint after request transmission.
3. No change to Operation, Query, Command, Ref, Selection, or Durable Operation authoring APIs.
4. No new authorization, Graph Read policy, Graph Command policy, Operation permission semantics,
   Query compilation, or Command execution logic.
5. No migration of Explorer reflection or reflected Entity data endpoints; they are not registered
   Runtime Protocol families today.
6. No WebSocket, NATS, SSE, gRPC, push, Event, subscription, retry, batching, offline, or caching
   protocol design.
7. No removal of Fetch-specific polling configuration from the Fetch Runtime Transport.

## Execution Slices

1. **Exchange contract:** prove common envelope creation, unique ids, response correlation, common
   errors, request initialization, and abort behavior through one shared test seam.
2. **Operation family:** migrate invocation, permission, reflected invocation, and their React
   bridge behavior to Runtime Transport.
3. **Graph families:** migrate Graph Read and Graph Command transports while preserving every
   semantic result and rejection.
4. **Client composition:** make one configured Runtime Transport feed Operation, Graph, Command,
   and Durable capabilities without duplicating Fetch options.
5. **Compatibility:** retain explicit legacy routing per family, document precedence, and prove
   mixed configurations without request fallback.
6. **Host proof:** exercise the unified client against both Express and Next.js `/runtime`
   projections and record the bounded legacy-removal criteria.

## Acceptance Checklist

- [x] Operation invocation and permission checks use the versioned `operation` family through
      `RuntimeTransport.request` by default.
- [x] Graph reads use `graph.read` and Graph Commands use `graph.command` through the same Runtime
      Transport by default.
- [x] Durable observation continues through `durable.operation.inspect` without hook-owned polling.
- [x] One Fetch endpoint, header, credential, request-init, abort, and correlation path serves all
      four families.
- [x] Family-specific results, semantic rejections, and protocol errors retain their current public
      client behavior.
- [x] Application-facing hooks, generated Entities, Queries, Commands, and reflected invocations do
      not change ergonomics.
- [x] `/operations`, `/graph/reads`, and `/graph/commands` remain available only through explicit
      documented compatibility selection.
- [x] A transmitted request is never automatically replayed against a legacy endpoint.
- [x] Mixed common/legacy family configurations have deterministic routing and no duplicated
      effects.
- [x] Express and Next.js common adapters pass the same representative client conformance cases.
- [x] Focused/full Core, React, Runtime Express, and Runtime Next.js tests, coverage, typecheck,
      lint, formatting, builds, Changeset status, and artifact verification pass.
- [x] Plan 146, Atlas, package READMEs, and developer documentation record the canonical client path
      and bounded compatibility lifecycle.

## Verification

1. Unit tests for shared exchange ids, correlation, request initialization, abort, malformed JSON,
   non-2xx common errors, and family response parsing.
2. Existing Operation bridge, reflected Operation invoker, Graph Read, Graph Command, Graph Client,
   and Durable hook suites run unchanged or with transport-only fixture updates.
3. Integration tests send all four families through one in-process Express adapter and one Next.js
   Route Handler adapter.
4. Compatibility tests select each legacy endpoint independently and prove no fallback after an
   ambiguous network or server failure.
5. Clean-room package artifacts exercise the public client and both server-adapter subpaths.

## Verification Evidence

1. Focused Core Runtime Protocol and Operation suites: 21 tests passed.
2. Focused React transport, Operation, Graph, client-composition, and hook suites: 48 tests passed.
3. Shared Express/Next.js host conformance: 2 tests passed; Todo Express integration: 26 tests
   passed.
4. `pnpm test:packages`: all 10 package suites passed, including Docker-backed PostgreSQL and
   Supabase integration tests.
5. `pnpm test:examples`: Todo passed 56 tests; Classroom passed 7 and skipped its 5 opt-in
   PostgreSQL cases.
6. `pnpm test:coverage:packages` passed. Representative statement coverage was 90.72% Core, 84.53%
   React, 89.28% Runtime Express, and 88.63% Runtime Next.js.
7. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm changeset:status`, and
   `pnpm verify:artifacts` passed. Artifact verification installed the packed public packages in a
   clean consumer and passed its type and runtime checks.

## Decisions

1. `compatibility` is the canonical legacy selector. Existing `operations.endpoint`,
   `operations.mountPath`, `graphRead.endpoint`, and `graphRead.commandEndpoint` remain deprecated
   aliases for this alpha migration; an explicit `compatibility` family entry wins.
2. Exchange-id creation and common correlation belong to the small Core
   `createRuntimeProtocolExchange` helper. `RuntimeTransport.request` remains the low-level
   transport contract.
3. Legacy routes are not removed in this slice. Removal requires downstream evidence that every
   enabled family has migrated to the common endpoint, canonical docs and examples use `/runtime`,
   and hosts no longer need legacy route traffic. No release boundary may introduce automatic
   fallback or replay.
