# 146d. Versioned Durable Operation Observation Protocol

Status: done

Parent plan: [146. Ontahí Runtime Protocol](./146-ontahi-runtime-protocol.md)

Predecessor: [146c. Runtime Protocol Dispatcher](../done/146c-runtime-protocol-dispatcher.md)

Canonical ID: `ontahi://plans/146d-versioned-durable-operation-observation-protocol`

## Summary

Give Durable Operation observation its first transport-independent, independently versioned
Runtime Protocol family. Starting durable work remains an ordinary `operation.invoke` that returns
a `TaskRunRef`. The new `durable.operation` family inspects that accepted identity and returns one
portable snapshot:

```json
{
  "protocol": "ontahi.runtime",
  "version": 1,
  "id": "exchange-2",
  "kind": "request",
  "family": "durable.operation",
  "body": {
    "version": 1,
    "kind": "inspect",
    "run": { "taskId": "Todo.completeAll", "runId": "run-1" }
  }
}
```

```json
{
  "protocol": "ontahi.runtime",
  "version": 1,
  "id": "exchange-2",
  "kind": "response",
  "family": "durable.operation",
  "body": {
    "version": 1,
    "kind": "snapshot",
    "snapshot": {
      "taskId": "Todo.completeAll",
      "runId": "run-1",
      "status": "running",
      "updatedAt": "2026-08-30T23:50:00.000Z",
      "progress": { "phase": "updating" }
    }
  }
}
```

Progress and final result are states in the snapshot, not separate client commands. Repeating
`inspect` is the portable polling baseline. A later push transport may deliver the same versioned
snapshot body without changing Durable Operation or React component semantics.

## Current Evidence

1. A Durable Operation already starts through the ordinary Operation dispatcher and returns a
   `TaskRunRef` containing `taskId`, `runId`, acceptance status, and optional subject.
2. `TaskRuntime`, `OntahiApplication`, and the current Express adapter expose `getSnapshot` for a
   `TaskRunIdentity`. The Express route currently returns a raw `TaskSnapshot` from a task/run URL.
3. `TaskSnapshot` carries queued, running, completed, failed, and cancelled state, timestamps,
   progress, error, and eventual result. In-memory snapshots also contain explicit `undefined`
   properties that JSON serialization happens to omit, so the protocol needs canonical portable
   normalization rather than a type assertion.
4. `useDurableOperation` currently calls `OperationBridgeAdapter.getTaskSnapshot` and owns TanStack
   Query polling through `refetchInterval`. That leaks the Fetch-era observation strategy into the
   hook.
5. No current `TaskRuntime`, application facade, or remote adapter exposes a cancellation command.
   Some providers can report `cancelled`, but Ontahí cannot yet honestly request or guarantee
   cancellation.
6. Task snapshot authorization has no protocol-level policy surface today. Registering the family
   must not automatically expose every run; a receiving runtime installs an explicit handler and
   derives authority outside the portable message.

## Settled Observation Direction

React should eventually depend on one Runtime Transport observation capability, conceptually
`observeDurableOperation(run)`, rather than selecting polling or push itself. The transport owns
the strategy:

1. A request/response Fetch transport repeatedly sends `durable.operation.inspect` according to
   its polling configuration.
2. A push-capable transport subscribes once and yields the same versioned snapshot values.
3. `useDurableOperation` consumes snapshots and retains its status, progress, final result, error,
   and completion-time cache invalidation semantics.
4. Capability negotiation and transport configuration select the implementation; no WebSocket or
   polling flag belongs in the portable Durable Operation message.

The current `pollIntervalMs` hook option and `getTaskSnapshot` bridge method remain compatibility
surfaces until the unified Runtime Transport slice replaces them. This slice defines the messages
they will carry, not the React/transport migration.

## Scope

1. Define public version 1 `inspect` request and `snapshot` response contracts for
   `durable.operation`.
2. Validate strict request keys, portable non-empty task/run identity, family version, and request
   kind before execution.
3. Canonicalize Task snapshots by validating their complete lifecycle shape, omitting absent
   properties, cloning JSON values, and preserving declared status/progress/error/result.
4. Add safe family protocol errors and response parsing for invalid or unavailable observation.
5. Register `durable.operation` beside `operation`, `graph.read`, and `graph.command`.
6. Prove the common Core dispatcher routes an inspect request with receiver-owned context and
   preserves the versioned snapshot body.
7. Record the React Runtime Transport observation direction and the absent cancellation capability.
8. Update Plan 146, Atlas, developer documentation, and add a Core Changeset.

## Non-Goals

1. No cancellation request. `cancelled` is an observable status until execution runtimes expose a
   truthful cooperative or provider-backed cancellation capability.
2. No Express `/runtime` projection, legacy Task endpoint migration, Fetch client migration, React
   hook refactor, or removal of `pollIntervalMs`/`getTaskSnapshot`.
3. No server Task observation policy or default handler that could expose runs without explicit
   authority decisions.
4. No subscription, push delivery, resume cursor, acknowledgement, WebSocket, SSE, or gRPC work.
5. No retry, replay, attempt, idempotency, delivery, or Task storage changes; Plan 132 retains those
   concerns.
6. No list-recent, task administration, worker control, or Event protocol.

## Acceptance Checklist

- [x] Start remains `operation.invoke`; inspect accepts only portable `TaskRunIdentity`.
- [x] Request and snapshot body versions are explicit and fail closed.
- [x] Snapshot normalization omits `undefined` properties and round-trips through JSON.
- [x] Every current Task status and optional lifecycle value is preserved semantically.
- [x] Malformed identities, statuses, timestamps, progress, errors, results, and strict keys fail.
- [x] `cancel` is rejected because no cancellation capability exists yet.
- [x] The canonical family registry and common dispatcher include `durable.operation`.
- [x] Receiver context reaches the Durable handler but never enters the portable message.
- [x] React polling/push strategy is documented as a Runtime Transport responsibility without
      changing the current hook in this slice.
- [x] Focused/full Core tests, coverage, typecheck, lint, formatting, build, artifact verification,
      and Changeset status pass.
- [x] Plan 146, Atlas, and developer documentation record the observation contract, authority
      boundary, and remaining transport/cancellation work.

## Delivery Evidence

1. `@ontahi/core/runtime/protocol` now publishes strict version 1 `inspect` request and `snapshot`
   response contracts, portable authoring helpers, response parsing, family errors, and the
   registered `durable.operation` family.
2. Snapshot normalization preserves every current Task status and lifecycle value while omitting
   absent properties and rejecting malformed or non-JSON values. `cancel` fails closed because no
   runtime exposes an enforceable cancellation capability.
3. The common dispatcher routes Durable observation with receiver-owned context and returns the
   independently versioned snapshot body without placing authority in the portable message or
   registering an unsafe default observation handler.
4. Semantic tests cover authoring from a `TaskRunRef`, registry typing, every status, complete and
   failed snapshots, strict malformed input, protocol errors, JSON portability, and dispatcher
   context/correlation. Full Core verification passes 797 tests; `runtime/protocol` reports 100%
   line coverage and `durable-operation.ts` reports 100% function and line coverage.
5. Core typecheck and lint, repository formatting, package builds, Changeset status, and
   clean-room package artifact installation/type/runtime verification pass.
6. Plan 146, Atlas, and developer documentation now state that Runtime Transport owns observation:
   Fetch may poll by repeating `inspect`, while a future push transport may yield the same snapshot
   values. Migrating Express/Fetch/React remains the next bounded slice.
