# 146g. Unified Fetch Runtime Protocol Clients

Status: next

Parent plan: [146. Ontahí Runtime Protocol](../current/146-ontahi-runtime-protocol.md)

Predecessor:
[146f. Next.js Runtime Protocol Adapter](../done/146f-nextjs-runtime-protocol-adapter.md)

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

## Current Evidence

1. Core `RuntimeTransport.request` carries a correlated Runtime Protocol request and returns a
   common response envelope or common protocol error.
2. `createFetchRuntimeTransport` already owns `/runtime` HTTP exchange, common response parsing,
   request correlation, and `durable.operation.inspect` polling.
3. The Fetch Operation bridge still posts an unversioned legacy body to a separately resolved
   `/operations` endpoint and parses an unwrapped Operation response.
4. The Fetch graph runtime posts canonical Graph Read and Graph Command bodies directly to
   `/graph/reads` and `/graph/commands`, with separate request setup and HTTP error handling.
5. `createFetchGraphClient` constructs all three Fetch paths independently even though it already
   exposes `runtimeTransport` beside them.
6. Express and Next.js can now project the same injected common dispatcher through `/runtime`.

## Proposed Form

The exact option names are provisional, but the configuration should make the canonical and legacy
paths unambiguous:

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
Existing public endpoint options may remain as deprecated aliases if that is the smallest honest
compatibility contract, but their selection and precedence must be documented and tested.

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

- [ ] Operation invocation and permission checks use the versioned `operation` family through
      `RuntimeTransport.request` by default.
- [ ] Graph reads use `graph.read` and Graph Commands use `graph.command` through the same Runtime
      Transport by default.
- [ ] Durable observation continues through `durable.operation.inspect` without hook-owned polling.
- [ ] One Fetch endpoint, header, credential, request-init, abort, and correlation path serves all
      four families.
- [ ] Family-specific results, semantic rejections, and protocol errors retain their current public
      client behavior.
- [ ] Application-facing hooks, generated Entities, Queries, Commands, and reflected invocations do
      not change ergonomics.
- [ ] `/operations`, `/graph/reads`, and `/graph/commands` remain available only through explicit
      documented compatibility selection.
- [ ] A transmitted request is never automatically replayed against a legacy endpoint.
- [ ] Mixed common/legacy family configurations have deterministic routing and no duplicated
      effects.
- [ ] Express and Next.js common adapters pass the same representative client conformance cases.
- [ ] Focused/full Core, React, Runtime Express, and Runtime Next.js tests, coverage, typecheck,
      lint, formatting, builds, Changeset status, and artifact verification pass.
- [ ] Plan 146, Atlas, package READMEs, and developer documentation record the canonical client path
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

## Open Decisions

1. Whether existing `operations.endpoint`, `graphRead.endpoint`, and
   `graphRead.commandEndpoint` options remain deprecated aliases or move behind one explicit
   `compatibility` object.
2. Whether exchange-id creation belongs on a small Runtime Protocol client helper or requires a
   refinement of the transport contract; family clients should not each invent a generator.
3. Which release marks legacy route options deprecated, and what downstream evidence is required
   before their later removal.
