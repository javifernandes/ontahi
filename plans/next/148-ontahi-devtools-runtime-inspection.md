# 148. Ontahí Devtools Runtime Inspection

Status: next

Canonical ID: `ontahi://plans/148-ontahi-devtools-runtime-inspection`

Durable shapes:

1. [Ontahí Developer Experience](../../atlas/items/developer-experience.md)
2. [Ontahí Devtools](../../atlas/items/source-code-organization/devtools.md)

Related plans:

1. [128. Ontahí Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
2. [132. Durable Invocation Identity And Idempotency](./132-durable-invocation-identity-and-idempotency.md)
3. [146h. WebSocket Runtime Transport And Durable Progress](../done/146h-websocket-runtime-transport-and-durable-progress.md)
4. [146i. Runtime Protocol Negotiation And Conformance](../backlog/146i-runtime-protocol-negotiation-and-conformance.md)

## Summary

Deliver the first independently usable Ontahí Devtools component for a web client. A developer
should see one semantic activity stream for Runtime Protocol work regardless of whether Fetch,
WebSocket, polling, or push carried it, then inspect Durable lifecycle, Ontahí client-cache state,
transport evidence, and effective routing without reconstructing Ontahí meaning from the browser
Network panel.

The first proof is an embedded, development-only floating panel in Todo. It observes the existing
`RuntimeTransport` and Graph Client Cache boundaries without changing application hooks, protocol
envelopes, dispatch, authority, or execution behavior.

## Context

Plan 146 established one strict Runtime Protocol and one client `RuntimeTransport` contract for
Operation invocation, Graph Reads, Graph Commands, and Durable inspection. Plan 146h added a
WebSocket session that multiplexes ordinary exchanges and pushed Durable snapshots, while Fetch
retains the equivalent unary and polling projection.

This creates a better inspection boundary than browser infrastructure exposes:

1. request IDs already correlate Runtime Protocol exchanges;
2. complete protocol families retain semantic intent across transports;
3. Durable observation is an `AsyncIterable<TaskSnapshot>` for both polling and push;
4. the Graph Client Cache already exposes inspectable records, aliases, outputs, and change events;
5. Todo already proves per-family HTTP, WebSocket, and mixed routing.

The missing boundary is diagnostic rather than protocol. Ontahí has no structured client event
stream for exchange lifecycle, actual transport selection, session state, Durable observation, or
cache activity. The Todo transport lab owns routing state locally, and the WebSocket client exposes
only an error callback rather than an inspectable connection lifecycle.

The implementation risk is not drawing a panel. It is observing these boundaries without changing
their timing or failure semantics, inventing false causality between independent state changes,
retaining sensitive payloads indefinitely, or making development tooling part of every production
client bundle.

## Target Experience

A developer opens one unobtrusive launcher and can:

1. follow a Runtime Protocol exchange from start to result, rejection, transport failure, or abort;
2. read a concise family-aware interpretation and, when payload capture is enabled, expand the
   exact portable envelopes;
3. filter activity by family, transport, state, duration, and text identity;
4. see one Durable run with its invocation and ordered observation snapshots instead of unrelated
   HTTP polls or WebSocket frames;
5. inspect current normalized Entity records, aliases, cached outputs, writes, and invalidations;
6. see which transport actually carried new work and the effective connection/capability state;
7. view effective transport settings and, when the host explicitly permits it, change routing for
   subsequent work;
8. clear bounded diagnostic history without mutating application data or client caches.

## Scope

1. Define a headless, browser-safe diagnostic event model for Runtime Protocol exchange,
   observation, transport, and cache evidence.
2. Add a bounded in-memory diagnostic store with `inspect`, `subscribe`, and diagnostic-history
   `clear` operations.
3. Instrument a `RuntimeTransport` through composition so request, response, protocol error,
   thrown transport error, abort, and duration are recorded without changing returned values.
4. Instrument Durable observation across iterator start, snapshots, terminal state, consumer abort,
   iterator failure, and cleanup.
5. Attribute each recorded exchange or observation to the actual configured transport instance.
6. Let Fetch and WebSocket contribute optional transport evidence such as endpoint, connection
   lifecycle, handshake capabilities, close code, and polling versus push without placing those
   details in portable Runtime Protocol envelopes.
7. Project Graph Client Cache snapshots and events without duplicating TanStack Query Devtools.
8. Add an accessible floating React panel with Activity, Durable, Cache, and Transport views plus a
   structured detail inspector.
9. Show effective transport configuration read-only and accept an optional host-owned routing
   controller for development overrides.
10. Extract only the minimum reusable routing/controller boundary proven by Todo; preserve explicit
    routing per complete protocol family and a distinct Durable observation route.
11. Integrate the published component into Todo and prove WebSocket-only, HTTP-only, and HTTP plus
    WebSocket push configurations.
12. Document development mounting, production exclusion, payload capture, redaction, retention,
    routing changes, and teardown.

## Non-Goals

1. No browser extension, standalone proxy, remote collector, hosted dashboard, or server tracing
   product in the first version.
2. No replacement for the browser's complete Network, performance, console, or security tooling.
3. No new Runtime Protocol family, envelope field, WebSocket session frame, or portable diagnostic
   message.
4. No automatic HTTP/WebSocket fallback, retry after ambiguous transmission, replay,
   resubscription, or exactly-once claim.
5. No Command or Operation replay button before Plan 132 establishes truthful invocation identity
   and idempotency semantics.
6. No Event inspection that anticipates the first-class Event model owned by Plan 146j.
7. No mutation of authority, authentication, endpoint policy, or deployment configuration from the
   panel.
8. No automatic causal claim between a protocol exchange and a cache event based only on temporal
   proximity.
9. No complete generalized capability negotiation or conformance work from Plan 146i.
10. No requirement that an application use the visual component to consume the headless diagnostic
    stream.

## Proposed Form

The intended composition is illustrative rather than a frozen public API:

```tsx
const diagnostics = createOntahiDiagnostics({
  capacity: 500,
  capturePayloads: false,
});

const http = instrumentRuntimeTransport({
  id: 'http',
  kind: 'fetch',
  transport: createFetchRuntimeTransport(),
  diagnostics,
});

const websocket = instrumentRuntimeTransport({
  id: 'websocket',
  kind: 'websocket',
  transport: createWebSocketRuntimeTransport(),
  diagnostics,
});

const router = createRuntimeTransportRouter({
  transports: { http, websocket },
  routes: {
    'graph.read': 'http',
    'graph.command': 'http',
    operation: 'http',
    'durable.operation.observe': 'websocket',
  },
});

<OntahiGraphProvider runtime={runtime} runtimeTransport={router.transport}>
  <TodoApp />
  <OntahiDevtools diagnostics={diagnostics} routing={router.controller} />
</OntahiGraphProvider>;
```

The diagnostic stream distinguishes three related layers:

```text
semantic activity
  Runtime Protocol exchange / Durable observation
    transport evidence
      Fetch request or WebSocket session/frame lifecycle

client state
  Graph Client Cache snapshot and events
```

Semantic activity supplies the primary identity and interpretation. Transport evidence explains
how it moved. Client-state events remain a parallel timeline until an explicit execution context
can prove causality.

One provisional diagnostic vocabulary is:

```ts
type RuntimeDiagnosticEvent =
  | { kind: 'exchange.started'; exchangeId: string; family: string; transportId: string }
  | { kind: 'exchange.settled'; exchangeId: string; outcome: ExchangeOutcome; durationMs: number }
  | {
      kind: 'observation.started';
      observationId: string;
      run: TaskRunIdentity;
      transportId: string;
    }
  | {
      kind: 'observation.snapshot';
      observationId: string;
      sequence: number;
      snapshot: TaskSnapshot;
    }
  | { kind: 'observation.settled'; observationId: string; outcome: ObservationOutcome }
  | { kind: 'transport.state'; transportId: string; state: RuntimeTransportState }
  | { kind: 'cache.event'; event: GraphClientCacheEvent };
```

Exact public names, payload ownership, and event normalization remain implementation outputs. The
contract must preserve complete Runtime Protocol and cache types where safe while keeping optional
transport evidence extensible and non-portable.

## Package And Runtime Boundary

Start with one focused `@ontahi/devtools` package:

1. its default browser-safe entrypoint owns the headless diagnostic store and transport
   instrumentation;
2. `@ontahi/devtools/react` owns the floating React component and hooks;
3. React is a peer of the visual subpath and is not loaded by the headless entrypoint;
4. Core remains technology-independent and receives no Devtools dependency;
5. `@ontahi/react` exposes only any narrow transport or cache diagnostic ports that prove generally
   useful; it does not absorb the visual panel;
6. importing or mounting Devtools remains explicit so production applications do not include it
   accidentally.

If package wiring dominates the first behavioral proof, begin the diagnostic model and UI together
inside the proposed package rather than creating a second temporary implementation in Todo. Todo
should be a consumer proof, not the source owner.

## Retention And Sensitive Data

1. History is a ring buffer with a finite default capacity and explicit clearing.
2. Payload capture is disabled by default; semantic summaries and structural metadata remain
   useful without retaining arbitrary input and result values.
3. When payload capture is enabled, a host-provided redactor runs before an event enters the store.
4. Credentials, cookies, headers, receiver context, and host authority never enter portable
   diagnostic events.
5. Diagnostic history is not persisted or uploaded in the first version.
6. Inspecting or clearing diagnostics never clears the Graph Client Cache or alters application
   state.

## Transport Settings Boundary

The panel always shows effective configuration when a transport can describe it. Mutable controls
appear only when the host passes an explicit development controller.

The controller owns routing policy; Devtools is merely one control projection. A change selects the
route for future exchanges. An active Durable observation remains pinned to its starting
transport. Unknown families fail or follow an explicit configured default. No selection change can
cause an already transmitted Operation or Command to execute again.

Endpoint URLs, authentication, origin policy, secure-cookie behavior, and production routing remain
host configuration. The first settings surface may expose route selection and safe timing options,
but it must not become an arbitrary credentialed endpoint editor.

## Execution Slices

1. [ ] Specify diagnostic identities, ordering, outcomes, retention, redaction, and teardown with
       focused transport-neutral tests.
2. [ ] Implement the headless store and `RuntimeTransport` decorator; prove complete unary and
       Durable iterator behavior with an in-memory transport.
3. [ ] Create the `@ontahi/devtools` package and its React subpath with an Activity list, filters,
       outcome states, and structured request/response detail.
4. [ ] Add Durable grouping and timeline projection without assuming that Fetch polls are distinct
       semantic observations.
5. [ ] Add optional Fetch/WebSocket evidence and a Transport view that reports connection,
       capabilities, polling/push, close, and failure state.
6. [ ] Project the existing Graph Client Cache snapshot and event stream in a Cache view without
       taking ownership of TanStack Query state.
7. [ ] Generalize Todo's minimum transport router/controller boundary and add read-only plus
       explicitly mutable Settings projection.
8. [ ] Mount Devtools in Todo, exercise all three routing presets, and verify that unmount/close
       releases listeners and observations.
9. [ ] Document the component and update the Developer Experience, Devtools, Runtime Protocol, and
       source-organization Atlas items with the proven boundary.
10. [ ] Add the package Changeset and pass package, example, artifact, accessibility, and browser
        verification before closing the Plan.

## Acceptance Checklist

- [ ] Fetch and WebSocket exchanges appear in one activity list with the same family semantics and
      the actual transport used.
- [ ] Operation, Graph Read, Graph Command, and Durable family requests retain exact correlation
      and settle once as success, protocol error, transport error, or abort.
- [ ] Durable invocation and observation are navigable as one run while preserving their distinct
      request and observation identities.
- [ ] Polling and push produce the same semantic snapshot timeline and expose different transport
      evidence.
- [ ] Duplicate, out-of-order, post-terminal, disconnect, malformed-frame, and abort behavior shown
      by Devtools agrees with the underlying transport contract.
- [ ] Diagnostic instrumentation does not change request bodies, response bodies, thrown errors,
      abort timing, iterator cleanup, routing, or hook behavior.
- [ ] The Cache view shows normalized records, aliases, outputs, writes, invalidations, and clear
      events without mutating either Ontahí or TanStack Query caches.
- [ ] Cache events are not attributed to an exchange without an explicit correlation source.
- [ ] Effective transport routing and capabilities are visible even when no mutable controller is
      supplied.
- [ ] Development routing controls affect only subsequent work and keep active Durable observation
      on its starting transport.
- [ ] No UI action retries, replays, resubscribes, or sends a request through another transport
      after an ambiguous failure.
- [ ] Diagnostic retention is bounded, payload capture is opt-in, and redaction happens before
      storage.
- [ ] Mounting is explicit, the headless entrypoint does not load React, and an application that
      does not import Devtools gains no production dependency or runtime work.
- [ ] The launcher, tabs, filters, detail inspector, and settings controls are keyboard-accessible
      and usable at narrow browser widths.
- [ ] Todo proves WebSocket-only, HTTP-only, and HTTP plus WebSocket push without application hook
      changes.
- [ ] Package artifacts expose only documented entrypoints and install in the clean consumer
      fixture.

## Verification

1. Headless unit tests with deterministic clock and identity generators for store ordering,
   capacity, redaction, exchange outcomes, abort, and Durable iterator cleanup.
2. Fetch and WebSocket adapter tests proving optional transport evidence without changing existing
   conformance assertions.
3. React component tests for filtering, details, grouping, cache projection, settings availability,
   keyboard operation, and teardown.
4. Todo routing tests proving future-work selection, active-observation pinning, explicit default or
   failure for unknown families, and absence of fallback.
5. Browser proofs for HTTP-only, WebSocket-only, and HTTP plus push, including visible intermediate
   Durable progress and connection failure.
6. Package coverage, typecheck, lint, formatting, package build, Todo build, Changeset status, and
   clean-room artifact installation/type/runtime verification.

## Decisions

1. The familiar product/component name is **Ontahí Devtools**; the initial package direction is
   `@ontahi/devtools` with a React subpath.
2. The first UI is an embedded floating panel, not a browser extension.
3. Instrumentation composes around public Ontahí boundaries and never patches global `fetch`,
   `WebSocket`, React Query, or browser APIs.
4. Diagnostics are local client evidence, not a Runtime Protocol family or server telemetry
   replacement.
5. Semantic activity, transport evidence, and cache state share a timeline but retain distinct
   identities and causality rules.
6. Settings belong in Devtools as an optional projection; routing ownership remains outside the
   panel and host-controlled.
7. Payload capture, persistence, export, replay, and remote collection are separate capabilities;
   only bounded opt-in in-memory capture belongs to this Plan.
8. The first package must be independently consumable rather than a Todo-local panel or an Explorer
   mode.

## Open Questions

1. Which transport lifecycle evidence can remain decorator-derived, and which WebSocket or Fetch
   states justify a narrow optional diagnostic port on the concrete adapter?
2. Should family-aware summaries live in the Devtools package initially or become family-owned
   portable interpreters after repeated non-Devtools consumers appear?
3. Does the reusable router belong in Core as generic `RuntimeTransport` composition or beside the
   current Fetch/WebSocket clients in `@ontahi/react/graph`?
4. Which payload fields can be summarized safely without enabling complete payload capture?
5. Should the panel reuse Explorer's JSON and theme primitives through a narrow dependency, or keep
   its first rendering independent until a genuinely shared UI surface emerges?

## Split And Closure Boundary

The first reviewable implementation slice ends when an independently packaged headless diagnostic
store plus Activity/Durable panel observes both an in-memory Fetch-like transport and WebSocket-like
transport without semantic drift. Cache, adapter lifecycle evidence, and mutable routing controls
may follow in later PRs under this Plan.

If generalizing routing requires negotiation, retry, resumption, or deployment policy, extract that
work instead of expanding this Plan. If remote collection, trace export, browser-extension
integration, or replay becomes actionable, create separately linked follow-ups. Close Plan 148 only
after Todo proves the complete local Devtools experience, package artifacts pass, and the durable
Atlas component and experience reflect what actually landed.
