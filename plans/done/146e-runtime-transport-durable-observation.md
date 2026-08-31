# 146e. Runtime Transport Durable Observation

Status: done

Parent plan: [146. Ontahí Runtime Protocol](../current/146-ontahi-runtime-protocol.md)

Predecessor:
[146d. Versioned Durable Operation Observation Protocol](../done/146d-versioned-durable-operation-observation-protocol.md)

Canonical ID: `ontahi://plans/146e-runtime-transport-durable-observation`

## Summary

Move Durable Operation observation out of React polling and into a transport capability. React
consumes one asynchronous snapshot sequence; the Fetch implementation produces that sequence by
repeating the versioned `durable.operation.inspect` request until a terminal snapshot arrives.

```ts
const transport = createFetchRuntimeTransport({
  endpoint: '/runtime',
  durableOperation: { pollIntervalMs: 500 },
});

for await (const snapshot of transport.durableOperation.observe(run)) {
  // queued -> running -> completed | failed | cancelled
}
```

`useDurableOperation` consumes the same capability and does not know whether snapshots came from
polling or push. A future NATS or another push transport can implement the sequence without
changing the hook or the Durable Operation protocol.

## Current Evidence

1. `OperationBridgeAdapter.getTaskSnapshot` currently mixes Operation invocation with Task
   observation, although those are distinct Runtime Protocol families.
2. `useDurableOperation` owns TanStack Query `refetchInterval` and exposes `pollIntervalMs` as a
   hook option. This makes a React component select the transport strategy.
3. The Fetch bridge reads raw snapshots from `GET /operations/tasks/:taskId/:runId`; it does not
   send the versioned `durable.operation` body delivered by Plan 146d.
4. Core now has a common family registry and dispatcher, but Express has no generic projection for
   it. The legacy task route is mounted unconditionally and has no explicit observation policy.
5. `OntahiGraphClient` already composes independent graph, Operation, and Explorer capabilities,
   so it is the smallest existing client seam in which to install a Runtime Transport.
6. `TaskSnapshot` is state, not an Event. Fetch can recover after interruption by inspecting again;
   this slice does not require streaming delivery, replay, acknowledgement, or JetStream.

## Scope

1. Add a transport-neutral Core `RuntimeTransport` contract with unary request exchange and an
   optional Durable Operation observation capability returning an `AsyncIterable` of snapshots.
2. Implement `createFetchRuntimeTransport` in `@ontahi/react` using the common Runtime Protocol
   envelope and strict Durable response parser.
3. Configure Fetch polling on transport construction, inspect immediately, stop on terminal state,
   and support aborting an active observation.
4. Expose Runtime Transport independently through `OntahiGraphClient` and `OntahiGraphProvider`.
5. Migrate `useDurableOperation` to consume the observer; remove hook-owned `pollIntervalMs` and
   Operation-bridge-owned `getTaskSnapshot`.
6. Add an Express Runtime Protocol handler and optional `/runtime` mount that require an injected
   common dispatcher and receiver-context factory. Do not install a default Durable handler.
7. Wire Todo Express explicitly to `durable.operation.inspect` and change its end-to-end proof to
   observe through the versioned POST message.
8. Preserve the legacy Task snapshot GET route as a bounded compatibility surface for consumers
   that have not migrated yet.
9. Update Plan 146, Atlas, developer documentation, package READMEs, and Changesets.

## Non-Goals

1. No WebSocket, NATS, SSE, gRPC, subscription protocol, capability negotiation message, or push
   implementation.
2. No Event protocol or Event delivery semantics.
3. No cancellation command, retry policy, snapshot persistence, sequence cursor, or replay.
4. No migration of Operation invocation, Graph Read, or Graph Command clients to `/runtime` in this
   slice.
5. No automatic Durable observation handler or new authorization policy hidden in Express. The
   host owns the dispatcher handler and derives its context from the trusted request.
6. No removal of the legacy Task GET endpoint until downstream consumers have a bounded migration.
7. No React dependency in Core and no transport concern in the Durable Operation model.

## Acceptance Checklist

- [x] Runtime Transport represents Durable observation as an optional capability, not a React or
      Fetch flag.
- [x] Fetch sends correlated `durable.operation.inspect` envelopes to `/runtime` and validates both
      the common envelope and family response.
- [x] Fetch owns polling cadence, stops after terminal snapshots, and aborts observation cleanup.
- [x] `useDurableOperation` consumes an asynchronous snapshot sequence and preserves progress,
      result, failure, cancellation, reset, execution state, and completion invalidation semantics.
- [x] Operation bridge adapters no longer own Task snapshot transport and hook options no longer
      expose polling cadence.
- [x] Express projects an injected common dispatcher and receiver context without installing an
      authority-free Durable handler.
- [x] Todo Express proves start through Operation invocation and observation through the versioned
      Runtime Protocol request.
- [x] The legacy Task GET remains available and documented only as compatibility.
- [x] Core, React, Runtime Express, and Todo focused/full tests, coverage, typecheck, lint,
      formatting, builds, Changeset status, and artifact verification pass.
- [x] Plan 146, Atlas, docs, and package READMEs describe the new ownership boundary and remaining
      push/transport migration work.

## Delivery Evidence

1. Core exports a transport-neutral `RuntimeTransport`; React exposes it independently through the
   graph client/provider and supplies a Fetch implementation whose Durable observer owns inspect,
   correlation validation, polling, terminal completion, and abort behavior.
2. `useDurableOperation` consumes the observer sequence while preserving accepted-run state,
   progress, terminal values, reset, and completion-time cache invalidation. Operation bridge
   adapters no longer expose Task snapshot transport or polling configuration.
3. Runtime Express exposes an optional `/runtime` projection for an injected common dispatcher and
   receiver-context factory. Todo installs only its explicit Durable handler and proves invocation
   through `/operations` followed by observation through versioned Runtime Protocol POSTs.
4. Verification passed on 2026-08-31: Core 797 tests with coverage; React 85 tests with coverage;
   Runtime Express 37 tests with coverage; Todo 53 tests including the HTTP lifecycle; affected
   typechecks and lints; repository formatting; all package builds; Changeset status; and clean-room
   package artifact install, type, and runtime checks.
