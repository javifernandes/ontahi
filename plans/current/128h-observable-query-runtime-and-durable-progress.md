# 128h. Observable Query Runtime And Durable Progress

Status: current

Canonical ID: `ontahi://plans/128h-observable-query-runtime-and-durable-progress`

Parent plan: [128. Ontahi Data Graph Execution Bridge](./128-ontahi-data-graph-execution-bridge.md)

Related plans:

1. [146h. WebSocket Runtime Transport And Durable Progress](../done/146h-websocket-runtime-transport-and-durable-progress.md)
2. [146j. First-Class Events Runtime Protocol Gate](../research/146j-first-class-events-runtime-protocol-gate.md)
3. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)

## Summary

Make observation a transport- and storage-neutral capability of an Ontahi Query. A Query observer
emits the complete current result when its meaning changes; it does not expose provider changefeed
records or introduce an Event model. Prove the capability first with the in-memory Data Graph and
then use a framework-owned Task run observation to replace Todo's server-side Durable polling while
preserving `useDurableOperation`.

The target authoring shape is intentionally the same Query language used for one-shot reads:

```ts
const incompleteTodos = TodoItem.all().where(todo => todo.completed.eq(false));

yield *
  incompleteTodos.observe().pipe(
    Stream.runForEach(
      todos => Effect.log(todos), // Each value is the complete current result of the Query.
    ),
  );
```

Effect `Stream` is the Core execution primitive. Callback subscriptions and React lifecycle
integration may adapt that stream without becoming the semantic contract.

## Context

Plan 146h removed browser polling when a WebSocket Runtime Transport observes Durable progress,
but Todo's Express host currently uses `createPollingDurableOperationObserver` to inspect its Task
Runtime every 100 milliseconds and push changed snapshots. That is a valid compatibility adapter,
not native push.

The larger pattern is already latent in the Data Graph. A canonical Query has stable semantic
identity, React normalizes its results into the Graph Client Cache by Entity identity, and graph
commands describe their affected Entity and Selection. The missing capability is repeated Query
evaluation driven by an abstract source of change. In-memory mutation notifications, database
triggers or CDC, provider-native subscriptions, workflow streams, and polling can all drive the
same observation contract.

`DataGraphRuntime.stream(...)` is not that contract: it streams the rows of one execution.
`observe(...)` emits repeated complete results across committed changes.

## Scope

1. Define Query observation as a repeated sequence of complete Query result snapshots.
2. Add a runtime observation capability without coupling Core to WebSocket, database triggers, or
   one provider.
3. Expose `observe()` on runtime-bound Queries and Selections while retaining `stream()` semantics.
4. Implement in-memory observation with an initial result, commit-driven reevaluation, resource
   cleanup, and transaction-aware notification.
5. Establish the framework-owned semantic `TaskRun` Entity or the smallest equivalent projection
   needed to express observation by `taskId` and `runId`.
6. Adapt native Task Runtime or Task storage changes into TaskRun Query observations.
7. Carry observable Graph results through a versioned Runtime Protocol session capability and the
   WebSocket transport.
8. Reimplement Durable Operation observation using the TaskRun observation path without changing
   `useDurableOperation` or its lifecycle state.
9. Remove Todo's server-side Durable polling only after the native observation proof passes.
10. Record causal metadata needed for diagnostics without claiming durable replay or global order.

## Non-Goals

1. No first-class Event declaration, delivery, acknowledgement, or replay; Plan 146j owns that
   semantic gate.
2. No claim that observing snapshots captures every intermediate mutation.
3. No automatic rewind of remote persistence or replay of external side effects.
4. No exactly-once delivery or total ordering across runtimes.
5. No provider-specific changefeed records in the Query API.
6. No requirement that every Data Graph runtime provide native observation in the first release.
7. No implicit long-lived subscription for every ordinary `useGraphQuery` call.
8. No removal of the Fetch or server-side polling compatibility observers.

## Observation Semantics

1. The first emitted value is the current Query result.
2. Later values are complete current results, not storage deltas.
3. A runtime may coalesce changes before reevaluation; observation is current-state delivery, not an
   audit log.
4. Each emitted result is reconciled atomically into the Graph Client Cache.
5. Query identity, observation identity, per-observation sequence, source runtime, and optional
   causal identity remain distinct.
6. Cancellation releases the underlying runtime observer and transport subscription.
7. Authorization applies to initial execution and remains a host/runtime responsibility for the
   lifetime of a remote observation.
8. A runtime without observation support fails explicitly or uses an explicitly configured
   compatibility adapter; it never silently changes transport after execution begins.

## Proposed Runtime Form

```ts
interface DataGraphObservationRuntime<TError, TOptions> {
  observe<TParams, TResult>(
    queryOrView: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TOptions,
  ): Stream.Stream<TResult[], TError>;
}
```

The first protocol projection may carry a Graph observation control frame around the existing
versioned Graph Read body. It must not invent a second Query language. The exact frame and
capability negotiation shape will be settled only after the local runtime proof.

## Vertical Proof

```text
TodoItem.completeAll
  -> Task context writes progress
  -> TaskRun persistence publishes a committed change
  -> TaskRun identity Query reevaluates
  -> Runtime session emits the new Query result
  -> WebSocket Runtime Transport yields a Durable snapshot
  -> unchanged useDurableOperation updates React state
```

## Execution Slices

### Slice 1: Local Query Observation

- [x] Define the runtime observation capability and distinguish it from row streaming.
- [x] Expose `observe()` on bound reads and Entity Selections.
- [x] Implement shared in-memory commit notification and Query reevaluation.
- [ ] Prove initial emission, predicate entry/exit, ordering changes, cleanup, failed commands, and
      transaction commit behavior.

### Slice 2: TaskRun As Observable Data

- [ ] Define the framework-owned TaskRun Entity shape and composite identity boundary.
- [ ] Project Task Runtime snapshots through that Entity without exposing engine-only sources.
- [ ] Make in-process Task progress, running, completion, and failure writes observable natively.
- [ ] Keep a polling adapter for runtimes that expose inspection only.

### Slice 3: Remote Observation

- [ ] Specify versioned Graph observation session frames and capability advertisement.
- [ ] Preserve Graph Read body validation, receiver authority, correlation, sequence, and cleanup.
- [ ] Implement WebSocket client observation and cache reconciliation.
- [ ] Define disconnect behavior without implicit replay or resubscription.

### Slice 4: Durable Compatibility Projection

- [ ] Route Durable observation through the TaskRun Query observer.
- [ ] Preserve the existing Durable Protocol snapshot body and `useDurableOperation` API.
- [ ] Remove Todo's `createPollingDurableOperationObserver` composition.
- [ ] Prove `TodoItem.completeAll` has no polling in either browser or server.

## Acceptance Checklist

- [ ] One canonical Query can execute once, stream rows once, or observe complete results without
      changing its Selection language.
- [ ] In-memory observation reacts to successful runtime-owned commits and releases subscribers.
- [ ] Entity identity normalization remains the Graph Client Cache authority.
- [ ] TaskRun observation is expressed through framework semantics rather than Todo-specific
      messages.
- [ ] Todo receives progress and terminal state without browser-side or server-side polling.
- [ ] `useDurableOperation` remains source-compatible and transport-neutral.
- [ ] Query observations remain distinct from durable Events and provider changefeed records.
- [ ] Unsupported observation, disconnect, duplicate delivery, and authorization behavior are
      explicit and tested.
- [ ] Public package changes include a Changeset and artifact verification.

## Verification

1. Focused Core tests for runtime observation and bound Query typing.
2. In-memory semantic tests covering membership and ordering changes after commands.
3. Task Runtime tests covering every lifecycle write and observer cleanup.
4. Runtime Protocol client/server session tests for observation identity and sequence.
5. React tests for normalized cache reconciliation and unchanged Durable hook behavior.
6. Todo Express integration proving native `TodoItem.completeAll` progress over WebSocket.
7. A check that fails if the Todo WebSocket host uses the polling observer.
8. Affected package typecheck, lint, coverage, build, Changeset status, and artifact verification.

## Decisions

1. Observation belongs to the Query execution model, not to WebSocket.
2. Complete result snapshots are the initial contract; deltas are an optimization behind it.
3. Effect `Stream` is the Core primitive; `subscribe(callback)` is optional consumer sugar.
4. Live Query observation does not imply an Event log or exhaustive mutation history.
5. TaskRun is the first vertical proof, not a special observation protocol.
6. Native and polling producers may satisfy one observer contract, but their guarantees must remain
   inspectable.

## Implementation Checkpoint — 2026-09-05

Core now defines `DataGraphObservationRuntime` separately from ordinary read execution. Runtime-bound
Queries and Entity Selections expose `observe()` as an Effect `Stream` of complete result arrays,
while `stream()` continues to yield rows from one execution. A runtime that lacks observation fails
explicitly when the stream is evaluated.

The in-memory runtime owns the first native implementation. Runtimes over the same dataset share a
scoped change hub, publish after successful graph commands, reevaluate the authored Query, and
suppress structurally identical JSON-safe results. Transactions isolate their intermediate writes
and notify observers only after the outer dataset commits. Tests prove initial delivery, Selection
entry and exit, ordering changes, cross-runtime notification, rollback isolation, and commit
delivery. The full Core suite passes with 824 tests, plus Core typecheck and lint.

This checkpoint deliberately stops before TaskRun projection, Runtime Protocol frames, React cache
integration, or changes to the Todo WebSocket observer. Those remain the next slices rather than
being inferred from the local observation proof.

## Open Questions

1. Should remote observation reuse `graph.read` inside session control frames or become a new
   registered Runtime Protocol family?
2. Which causal fields belong in the common observation envelope before first-class Events exist?
3. Should `useGraphQuery` require an explicit `observation: 'live'` option or should generated
   clients expose a distinct live hook?
4. How should dependency-aware invalidation avoid reevaluating unrelated Queries without exposing
   provider deltas publicly?
5. Which Task runtimes can provide truthful native observation, and which must advertise polling
   compatibility?
