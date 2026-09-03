# 146h. WebSocket Runtime Transport And Durable Progress

Status: next

Canonical ID: `ontahi://plans/146h-websocket-runtime-transport-and-durable-progress`

Parent plan: [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)

Related plans:

1. [132. Durable Invocation Identity And Idempotency](./132-durable-invocation-identity-and-idempotency.md)
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

1. [ ] Specify session frames, correlation identities, close/error behavior, and the exact boundary
       between Runtime Protocol envelopes and transport control frames.
2. [ ] Add focused client/server session conformance tests before choosing framework integration.
3. [ ] Implement the WebSocket client `RuntimeTransport.request(...)` path for all currently
       registered request/response families.
4. [ ] Implement pushed Durable observation with abort and terminal cleanup.
5. [ ] Add the transport-neutral server session adapter over the existing dispatcher and task
       runtime.
6. [ ] Add the Todo Express WebSocket projection and configure the existing React provider.
7. [ ] Prove `TodoItem.completeAll` progress without Fetch polling and without application-specific
       transport code.
8. [ ] Publish developer documentation and extract any reconnection or negotiation work that the
       bounded proof cannot settle.

## Acceptance Checklist

- [ ] One WebSocket connection carries concurrent Runtime Protocol request/response exchanges with
      exact correlation.
- [ ] Operation, Graph Read, Graph Command, and Durable inspection family bodies remain unchanged.
- [ ] `useDurableOperation` consumes pushed snapshots through the existing transport capability.
- [ ] Todo starts and observes `TodoItem.completeAll` without client polling.
- [ ] Receiver authority comes from the WebSocket host/session context, never from a portable
      message body.
- [ ] Abort/unsubscribe releases server and client observation resources.
- [ ] Disconnect and reconnect behavior is explicit; no progress or exactly-once guarantee is
      inferred from the socket.
- [ ] Duplicate, out-of-order, malformed, mismatched-run, and post-terminal snapshots are covered by
      semantic tests.
- [ ] A runtime without WebSocket support can continue using Fetch polling with unchanged
      application authoring.
- [ ] No Event protocol or Todo-specific transport contract is introduced.

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

## Open Questions

1. Should the first server projection live in a dedicated runtime package or compose through the
   Express package with an injected WebSocket server?
2. Does the session handshake advertise only `durable-operation-push`, or a minimal set of all
   available transport capabilities?
3. Should reconnection automatically re-observe active run identities, or should the React owner
   re-establish observation from retained operation state?
4. What ordering/deduplication key, if any, belongs on snapshots beyond run identity and status?
5. Can server-side polling honestly power the first push proof, or must the reference Task Runtime
   expose an observable snapshot source first?
