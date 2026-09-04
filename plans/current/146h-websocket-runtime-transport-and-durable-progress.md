# 146h. WebSocket Runtime Transport And Durable Progress

Status: current

Canonical ID: `ontahi://plans/146h-websocket-runtime-transport-and-durable-progress`

Parent plan: [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)

Related plans:

1. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)
2. [146i. Runtime Protocol Negotiation And Conformance](../backlog/146i-runtime-protocol-negotiation-and-conformance.md)
3. [146j. First-Class Events Runtime Protocol Gate](../research/146j-first-class-events-runtime-protocol-gate.md)

## Summary

Implement a WebSocket projection of the existing Ontahí Runtime Protocol and prove that one
configured `RuntimeTransport` can multiplex ordinary request/response exchanges with pushed Durable
Operation snapshots. Preserve the application-facing Operation, Query, Command, and
`useDurableOperation` ergonomics established by Plan 146.

The first end-to-end proof is Todo's existing `TodoItem.completeAll` Durable Operation. Starting the
operation and observing queued, running, progress, and terminal snapshots should use the WebSocket
transport without polling and without adding Todo-specific endpoints or hooks.

## Context

Core already defines `RuntimeTransport.request(...)` and a Durable observation capability that
returns `AsyncIterable<TaskSnapshot>`. React delegates `useDurableOperation` observation to that
capability. Fetch implements it by repeatedly sending `durable.operation.inspect` through
`/runtime`. Express and Next.js already adapt the same family dispatcher.

The missing piece is a session transport that keeps one connection, correlates concurrent Runtime
Protocol exchanges, and can push later Durable snapshots for an observed run. This is transport
work, not a new Durable Operation model and not an Event subscription shortcut.

## Scope

1. Define a minimal, versioned WebSocket session frame around existing Runtime Protocol envelopes
   and Durable observation control.
2. Implement a client `RuntimeTransport` that correlates concurrent request/response exchanges over
   one connection.
3. Implement `durableOperation.observe(...)` as an abortable pushed snapshot stream over that same
   connection.
4. Add a transport-neutral server session boundary that delegates requests to the existing Runtime
   Protocol dispatcher and Durable inspection to the existing task runtime.
5. Project that boundary through the Todo Express host with receiver-owned authentication and
   invocation context.
6. Configure the Todo React application to use the WebSocket transport and prove
   `TodoItem.completeAll` from invocation through terminal progress.
7. Define disconnect, resubscription, duplicate snapshot, malformed frame, unavailable capability,
   and terminal cleanup behavior honestly.
8. Document when Fetch polling remains the appropriate fallback and how a host chooses its
   transport explicitly.

## Non-Goals

1. No first-class Event declaration, subscription, delivery, acknowledgement, or replay semantics.
2. No NATS, gRPC, SSE, queue, offline replication, or convergent-state implementation.
3. No generic capability-negotiation vocabulary beyond the minimum session handshake required by
   this proof; Plan 146i owns the complete contract.
4. No claim of exactly-once delivery. Duplicate snapshots must be harmless and observable.
5. No Durable cancellation until Task Runtimes expose an enforceable cancellation capability.
6. No Todo-specific WebSocket messages, routes, or React hooks.
7. No replacement of the Fetch transport or legacy compatibility endpoints.

## Proposed Vertical Slice

```text
Todo useDurableOperation(TodoItem.completeAll)
  -> WebSocket RuntimeTransport.request(operation invoke)
  -> existing Runtime Protocol dispatcher
  -> Durable run identity
  -> RuntimeTransport.durableOperation.observe(run)
  -> WebSocket observe frame
  -> pushed versioned TaskSnapshot frames
  -> unchanged React Durable Operation state
```

The server may implement pushed observation by watching a capable Task Runtime or by bounded
server-side inspection. The browser must not poll once the WebSocket observation capability is
selected. Transport implementation details must not enter the Durable Operation declaration or
React hook contract.

## Execution Slices

1. [x] Specify session frames, correlation identities, close/error behavior, and the exact boundary
       between Runtime Protocol envelopes and transport control frames.
2. [x] Add focused client/server session conformance tests before choosing framework integration.
3. [x] Implement the WebSocket client `RuntimeTransport.request(...)` path for all currently
       registered request/response families.
4. [x] Implement pushed Durable observation with abort and terminal cleanup.
5. [x] Add the transport-neutral server session adapter over the existing dispatcher and task
       runtime.
6. [x] Add the Todo Express WebSocket projection and configure the existing React provider.
7. [x] Prove `TodoItem.completeAll` progress without Fetch polling and without application-specific
       transport code.
8. [x] Publish developer documentation and extract any reconnection or negotiation work that the
       bounded proof cannot settle.

## Acceptance Checklist

- [x] One WebSocket connection carries concurrent Runtime Protocol request/response exchanges with
      exact correlation.
- [x] Operation, Graph Read, Graph Command, and Durable inspection family bodies remain unchanged.
- [x] `useDurableOperation` consumes pushed snapshots through the existing transport capability.
- [x] Todo starts and observes `TodoItem.completeAll` without client polling.
- [x] Receiver authority comes from the WebSocket host/session context, never from a portable
      message body.
- [x] Abort/unsubscribe releases server and client observation resources.
- [x] Disconnect and reconnect behavior is explicit; no progress or exactly-once guarantee is
      inferred from the socket.
- [x] Duplicate, out-of-order, malformed, mismatched-run, and post-terminal snapshots are covered by
      semantic tests.
- [x] A runtime without WebSocket support can continue using Fetch polling with unchanged
      application authoring.
- [x] No Event protocol or Todo-specific transport contract is introduced.

## Verification

1. Core type and protocol tests for session frames and correlation.
2. Shared client/server transport conformance tests with an in-memory WebSocket pair.
3. React tests proving the existing Durable hook consumes pushed progress and cleans up on abort.
4. Express integration tests for authority, multiple concurrent exchanges, disconnect, and
   terminal cleanup.
5. Todo browser proof for `TodoItem.completeAll`, including visible intermediate progress and a
   terminal result.
6. Package typecheck, lint, focused coverage, artifact verification, and a Changeset for public
   transport surfaces.

## Decisions

1. WebSocket is one projection of the Runtime Protocol, not a second protocol.
2. One configured Runtime Transport preserves the same application authoring used with Fetch.
3. Durable push reuses the existing snapshot and `AsyncIterable` observation contracts.
4. Focus remains a bounded Durable progress proof; Events require Plan 146j first.
5. NATS may later serve backend distribution, but it is not the browser transport in this slice.

## Resolved Questions

1. The transport-neutral session boundary lives in Core. The first network projection composes
   through `@ontahi/runtime-express/runtime-protocol` and an injected host-owned HTTP server.
2. The version 1 ready frame advertises only `request-response` and optional
   `durable-operation-push`. Broader negotiation remains Plan 146i.
3. Disconnect fails active exchanges and observations without resuming them. A later request may
   open a new socket, but re-observation remains explicit until a truthful resume contract exists.
4. Durable frames add a session-local monotonic sequence. It detects duplicate, out-of-order, and
   post-terminal delivery without changing the Durable snapshot body or claiming replay.
5. A reusable server observer may poll existing Task inspection and push only changed snapshots.
   This is documented as server-side compatibility, not native Task Runtime push; the browser never
   polls. A host can inject a native `AsyncIterable` when its Task Runtime provides one.

## Implementation Checkpoint — 2026-09-04

Core now owns strict version 1 session frames, the server session lifecycle, and the bounded
inspection observer. React exposes a lazy, multiplexed WebSocket Runtime Transport plus generic
Runtime Graph Client composition. Express projects a host-owned HTTP server through `ws`, derives
trusted context from the upgrade request once, and aborts observation on unsubscribe or disconnect.

Todo uses that transport for Graph Read, Graph Command, Operation invocation, and pushed Durable
progress on one `/runtime` socket. `TodoItem.completeAll` exposes its existing progress and final
result through the unchanged `useDurableOperation` API. The UI proof observed “Durable progress:
updating todos” followed by “Completed 3 todos” with no browser console warnings or errors. Fetch
polling remains available and its existing suite is unchanged.

The Todo Runtime transport lab additionally demonstrates per-family composition: reads, commands,
Operation calls, and Durable observation can independently select HTTP or WebSocket, including the
common HTTP-plus-WebSocket-push deployment shape. The Express projection exposes a host-owned
upgrade authorization callback; Todo validates same-origin browser handshakes before restoring the
same Passport session cookie used by HTTP. Session authority remains fixed for that socket, so
logout reloads the example and production revocation remains an explicit host responsibility.
The mixed-mode browser proof also exposed and fixed schema Selection inputs reaching the strict
Operation family as class values; the React bridge now converts them to portable Selection ASTs
before either HTTP or WebSocket transmission.
