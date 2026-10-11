# 154e. Reactive Program Evaluation

Status: done

Canonical ID: `ontahi://plans/154e-reactive-program-evaluation`

Related plans:

1. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)
2. [128h. Observable Query Runtime And Durable Progress](../done/128h-observable-query-runtime-and-durable-progress.md)
3. [154d. Semantic Mutation Journal And Query Invalidation](../done/154d-semantic-mutation-journal-and-query-invalidation.md)
4. [148. Ontahí DevTools Runtime Inspection](../current/148-ontahi-devtools-runtime-inspection.md)

## Summary

Prove that one canonical Query denotes the same semantic value when evaluated once or maintained
reactively. A headless Effect consumer and a React consumer must receive equivalent complete-current
result snapshots from the same Query and runtime capability. React Query, WebSocket, polling, cache
keys, and provider changefeeds remain lifecycle or transport mechanisms rather than authored
semantics.

This plan does not rebuild Query observation. Plan 128h already established transport-neutral
`Query.observe()`, complete snapshot semantics, cancellation, Runtime Protocol transport, and native
in-memory observation. Plan 154d added semantic mutation-driven refresh. This intervention tests
whether those capabilities already form the reactive part of the semantic kernel and adds only the
smallest missing consumer and inspection boundaries.

The proof is allowed to conclude that the existing runtime-bound Query is the stable semantic term
and that no new `Program` wrapper is justified.

## Question Being Answered

Given one closed Query:

```text
TodoItem where list = Inbox and completed = false
```

can Ontahí preserve one value meaning across both modes?

```text
run(query)     -> one complete current TodoItem[]
observe(query) -> complete current TodoItem[] followed by meaningful revisions
```

The React surface should opt into the second lifecycle without translating the Query into React
Query keys or defining a second observation language. A headless consumer should observe the same
snapshots without importing React.

## Existing Evidence

1. `DataGraphRuntime.run` and `DataGraphObservationRuntime.observe` already share `QueryOrView`.
2. Runtime-bound Queries already expose `run()` and `observe()` over the same authored Query.
3. `createRemoteDataGraphRuntime` lowers both modes through canonical Graph Read requests.
4. Runtime Protocol sessions and WebSocket transport already carry Graph observation snapshots.
5. `createRuntimeGraphClient` reconciles observed snapshots into the Graph Client Cache.
6. React's `useGraphQuery` currently performs one-shot reads and mutation-triggered refetches; its
   `ReactGraphExecutor` does not expose observation.
7. DevTools already groups Graph observation transport activity as one Query lifecycle with
   revisions and cancellation, so the React path can reuse that evidence instead of adding a
   React-specific activity model.

The missing proof is therefore at the shared evaluation/consumer boundary, not in storage or wire
protocol infrastructure.

## Semantic Contract

For a fixed closed Query, parameters, authority, and model version:

1. the first observed snapshot has the same value semantics as one-shot execution at that point;
2. later observed values are complete current results, never row events or mutation deltas;
3. structurally unchanged results may be coalesced;
4. cancellation releases the observation and its transport resources;
5. a consumer may cache or normalize a snapshot without changing its semantic value;
6. unsupported observation fails explicitly and never silently falls back after evaluation starts;
7. observation remains distinct from row streaming, Operation progress, and Events;
8. transport and scheduler details are inspection metadata, not part of the Query term.

## Proposed Consumer Form

Keep the existing Query as the semantic owner:

```ts
const incomplete = TodoItem.all().where(item => item.completed.eq(false));

// Headless
incomplete.observe();

// React
useGraphQuery(incomplete, { observation: 'live' });
```

The exact React option name is provisional until implementation, but the proof should prefer an
explicit lifecycle option over a second Query authoring API. Ordinary `useGraphQuery(query)` remains
one-shot plus cache invalidation. Live observation must be opt-in because it owns a long-lived
resource.

The React adapter may expose the existing Effect Stream as an `AsyncIterable` internally if that
keeps React lifecycle code independent of Effect runtime details. That adapter is not a new
semantic protocol.

## Vertical Proof

Use one Todo Query over the existing Runtime Graph Client:

```text
TodoItem where list = Inbox order by title ascending
```

1. execute it once and retain the initial value;
2. start a headless observation of the same Query;
3. mount a React consumer with live observation enabled;
4. apply a Graph Command that changes membership or ordering;
5. prove both consumers receive equivalent complete snapshots;
6. unmount/cancel and prove the server observation and transport subscription are released;
7. inspect one DevTools activity whose revisions explain initial snapshot, refresh cause, and
   cancellation without presenting each revision as an unrelated top-level read.

The proof should use the real in-memory runtime and Runtime Protocol/WebSocket path where affordable.
It must not mock away the lifecycle or the semantic refresh path being tested.

## External Or Derived Dependency Probe

After the direct Graph Query proof, add one bounded dependency that the Data Graph cannot maintain
from its own mutation journal alone. A fake rating provider is sufficient:

```text
Movie
  where owner = CurrentPrincipal()
  and IMDb.rating(imdbId) > 3
```

This probe must determine, rather than assume:

1. whether the existing Query/derived-field model can represent the dependency honestly;
2. which evaluator owns its current value and revision signal;
3. whether dependency metadata belongs in the authored term, an evaluation plan, or runtime-private
   state;
4. how external work is bounded or batched;
5. what explicit unsupported behavior is preferable when the dependency cannot be observed.

Do not generalize a federation planner from this example. If the external probe requires a broad
new expression or provider API, record that boundary and stop after the direct vertical proof.

## Scope

1. One explicit live-observation mode on the React Query consumer surface.
2. A React executor observation capability derived from the existing Data Graph observer.
3. Shared output normalization and Graph Client Cache reconciliation for one-shot and observed
   snapshots.
4. Headless and React conformance over the same canonical Query.
5. Cancellation, error, unsupported-capability, identity-change, and Strict Mode lifecycle tests.
6. One Todo end-to-end demonstration through the Runtime Protocol observation path.
7. DevTools grouping and language that distinguish a reactive Query lifecycle from ordinary reads,
   row streams, Operation progress, and Events.
8. One bounded external or derived dependency probe, provided it does not require speculative
   federation infrastructure.
9. Documentation of whether a new kernel abstraction paid rent or the existing Query boundary was
   sufficient.

## Non-Goals

1. No automatic live subscription for every `useGraphQuery` call.
2. No replacement of semantic invalidation or ordinary one-shot refetches.
3. No generic event bus, durable Event declaration, acknowledgement, replay, or exactly-once claim.
4. No row-level delta protocol or requirement to deliver every intermediate state.
5. No new Query syntax merely to select an evaluation lifecycle.
6. No public `Program<T>` or `Reactive<T>` wrapper unless the vertical proof demonstrates behavior
   the existing bound Query cannot express.
7. No provider-specific WebSocket, polling, CDC, or React Query details in the authored Query.
8. No general distributed/federated Query optimizer.
9. No coupling of React component lifetime to server resources without deterministic cancellation.

## Execution Slices

### Slice 1: Shared evaluation baseline

- [x] Write a conformance fixture that runs and observes one canonical Query through the same
      runtime.
- [x] Assert that the first observed snapshot and the one-shot result have equal value semantics.
- [x] Record whether runtime-bound Query already supplies the required semantic boundary.
- [x] Keep row streaming explicitly outside this equivalence.

### Slice 2: React live consumer

- [x] Add observation to the React executor without inventing a second Query representation.
- [x] Add explicit live lifecycle selection to `useGraphQuery` while preserving current defaults.
- [x] Reconcile every complete snapshot through the existing Graph Client Cache.
- [x] Prove loading, current value, revision, error, cancellation, identity change, and Strict Mode
      remount behavior.
- [x] Ensure no duplicate initial one-shot request is required for a live Query.

### Slice 3: Runtime Protocol Todo proof

- [x] Observe one application Query from a headless consumer and a React consumer through the same runtime
      client.
- [x] Mutate membership or ordering through a canonical Graph Command.
- [x] Prove both consumers converge on equivalent complete snapshots.
- [x] Prove cancellation removes the active transport/server observation.

### Slice 4: DevTools lifecycle

- [x] Group initial snapshot and later revisions under one reactive Query activity.
- [x] Explain revision cause when semantic mutation metadata is available.
- [x] Show observation identity, current revision, lifecycle state, and transport as technical
      evidence rather than separate semantic concepts.
- [x] Keep refresh mechanics and internal reads out of the top-level activity list by default.

### Slice 5: Bounded dependency probe

- [ ] Model one contextual plus external or derived value without treating it as a Hole.
- [ ] Bound external evaluation and supply one revision signal.
- [ ] Compare one-shot and observed values through one dependency change.
- [x] Stop and transfer the unsupported external dependency contract to candidate slice 154g instead
      of introducing a speculative federation framework.

## Acceptance Checklist

- [x] One canonical Query runs once and is observed without changing its authored form.
- [x] A headless consumer and a React consumer receive equivalent complete-current snapshots.
- [x] Live React observation is explicit and ordinary `useGraphQuery` remains source-compatible.
- [x] Live mode avoids duplicate initial reads and reconciles the Graph Client Cache.
- [x] Cancellation is deterministic across React, transport, server registry, and provider runtime.
- [x] Unsupported observation and observation failures remain visible and testable.
- [x] DevTools presents one causal reactive lifecycle rather than unrelated request noise.
- [x] Row streams, Operation progress, Events, and Query revisions remain visibly distinct.
- [x] The implementation records whether the stable kernel boundary is the existing Query or a
      smaller newly proven abstraction.
- [x] The external/derived dependency probe either passes within bounded scope or produces an
      explicit follow-up with the missing contract.
- [x] Public package changes include a Changeset and affected package verification.

## Verification

1. Core conformance tests for one-shot/observe equivalence, revisions, and cancellation.
2. React hook tests for first snapshot, revisions, cache reconciliation, errors, unmount, identity
   changes, and Strict Mode.
3. Runtime Graph Client and WebSocket integration tests using canonical Graph Reads.
4. Application integration covering a real mutation and two consumers, plus Todo client wiring.
5. DevTools tests for lifecycle grouping and refresh-cause presentation.
6. Affected package typecheck, lint, coverage, build, Changeset status, and artifact verification.

## Decisions

1. Query observation remains opt-in at the React boundary.
2. Complete current snapshots remain the semantic value; deltas are implementation evidence.
3. The first implementation must attempt to reuse the existing runtime-bound Query before adding a
   kernel wrapper.
4. React Query may store the current snapshot but does not define observation identity or
   dependency semantics.
5. The external dependency is a bounded probe, not permission to build general federation.

## Closure

The vertical proof did not justify a new `Program<T>` or `Reactive<T>` wrapper. A runtime-bound
Query already owns the stable semantic term; `run()` and `observe()` are evaluation lifecycles over
that same value. React now exposes the distinction explicitly as
`useGraphQuery(query, { observation: 'live' })` and uses the existing observation-capable executor,
Runtime Protocol transport, Graph Client Cache, and DevTools observation activity.

The first complete snapshot supplies the React Query value without a preceding one-shot read.
Later complete snapshots replace it. Execution identity changes and Strict Mode remounts cancel the
previous observer, and unmounting releases the server/provider subscription. Active live Queries
do not also participate in mutation-triggered one-shot invalidation, avoiding a redundant second
subscription and initial snapshot.

The Runtime Protocol integration proof runs one Query simultaneously through a headless Effect
consumer and the React hook, applies a canonical mutation, compares the resulting snapshots, and
asserts that all observers are released. Todo opts its flat Tag Query into this lifecycle. Its
nested list projection remains on semantic mutation refresh because contextual Graph Read
observation would require extending the current observation wire contract; that is an explicit
stop condition rather than an implicit fallback.

The external/derived dependency probe reached the same boundary earlier: Ontahí does not yet have
an honest contract naming an external evaluator's dependency and revision signal. Inventing that
contract here would have started the federation planner excluded by this plan. The missing bounded
external dependency/evaluator contract is therefore transferred to candidate distributed-
evaluation slice 154g in Plan 154. Waits, Events, and continuations remain the separate 154f slice.

## Stop Conditions

Split or pause the intervention if:

1. live React consumption requires changing the Graph Read wire protocol;
2. the direct proof requires a new public root abstraction that does not remove an existing concept;
3. cancellation cannot be made deterministic with the current executor boundary;
4. the external dependency probe requires a general planner, event protocol, or provider registry;
5. DevTools grouping requires coupling diagnostics to React internals rather than runtime causal
   identity.
