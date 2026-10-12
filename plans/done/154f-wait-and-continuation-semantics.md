# 154f. Wait And Durable Continuation Semantics

Status: done

Canonical ID: `ontahi://plans/154f-wait-and-continuation-semantics`

Shapes: [Semantic Program Kernel](../../atlas/items/model/semantic-program-kernel.md),
[Operation Interaction](../../atlas/items/model/operation-interaction.md), and
[Durable Operation](../../atlas/items/model/durable-operation.md).

Related plans:

1. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)
2. [153c. Interactive And Resumable Operation Execution](../current/153c-operation-interactions-and-resumption.md)
3. [153d. LangGraph Task Runtime Comparison](../current/153d-langgraph-task-runtime-comparison.md)
4. [146j. First-Class Events Runtime Protocol Gate](../research/146j-first-class-events-runtime-protocol-gate.md)

## Summary

Prove that an existing typed Operation Interaction is a one-shot durable wait over a persisted
continuation, and make that temporal meaning explicit in the public Task lifecycle. A Task that has
published an unanswered Interaction is not actively `running`: it is `waiting`. Accepting exactly
one authorized, correlated response moves it back to `running`, restores its logical execution
state, and eventually produces one terminal result.

The repository already contains most continuation mechanics. Explicit Task executions persist
JSON-safe state, an expected Interaction, and an accepted response. Both the native in-process
runtime and the LangGraph runtime can reconstruct execution after runtime recreation. This plan
must consolidate and expose that behavior rather than invent a second `Wait<T>` language or rebuild
workflow infrastructure.

## Existing Evidence

1. `TaskExecutionCheckpoint` persists JSON-safe state plus either one pending Interaction or its
   accepted response.
2. Native explicit Task execution resumes from Task Storage without retaining a JavaScript stack.
3. LangGraph maps the same Task execution and Interaction contracts to provider-owned checkpoint
   and replay state.
4. Both runtimes validate Interaction correlation, response shape, actor identity, and atomic
   single-claim behavior.
5. Runtime Protocol already transports choice, input, and approval requests and responses.
6. DevTools and the Todo chat already project pending Interactions independently of their rendering
   surface.
7. Legacy function-style `context.interact` remains process-local and is not evidence of a durable
   continuation.

The main semantic leak is that a persisted pending Interaction is currently reported as
`status: 'running'`. Consumers must infer suspension from an optional sibling field, and progress,
waiting, and active execution can appear contradictory.

## Lifecycle Contract

For explicit Task executions:

```text
queued -> running -> waiting -> running -> ... -> completed | failed | cancelled
```

1. `running` means the Task is eligible for or actively performing evaluation.
2. `waiting` means evaluation has checkpointed one exact typed Interaction and requires an external
   response before it can continue.
3. A `waiting` snapshot must expose that pending Interaction.
4. Claiming the matching response atomically removes the pending Interaction and returns the run to
   `running` before continuation execution starts.
5. Invalid, mismatched, unauthorized, and duplicate responses never create a second continuation.
6. Restart reconstructs logical execution from persisted state and registered Task definitions;
   credentials, live capability objects, JavaScript stacks, and closures are not checkpoint data.
7. The initiating actor remains part of run provenance. The response actor is authorized
   separately and does not replace execution identity.

Legacy function-style Tasks may expose `waiting` while their process-local Interaction is pending,
but they do not become restart-safe. The explicit state-machine form remains the durable contract.

## Temporal Distinctions

This slice records, but does not collapse, three different lifecycles:

```text
Interaction wait  = one expected typed response, then continuation resumes
Query observation = one complete current value followed by revisions until cancellation
Event reaction    = discrete occurrences and a potentially persistent handler lifetime
```

`waiting` belongs to a bounded Task Run. It does not introduce a domain Event declaration,
subscription, acknowledgement, replay, ordering, or retention model. Plan 146j remains the gate for
that work. `onEach` is therefore outside this implementation.

## Vertical Proof

Use one explicit review Task with a choice followed by an approval:

1. start the Task and observe `running`;
2. checkpoint the choice and observe `waiting` with its stable Interaction identity;
3. recreate the runtime over the same Task Storage;
4. reject an unauthorized or mismatched response without changing the wait;
5. claim the valid choice exactly once and observe `running` before the next step;
6. checkpoint approval and observe a second `waiting` state;
7. recreate the runtime again, approve, and reach one terminal result;
8. run the same semantic sequence on the native explicit executor and LangGraph executor;
9. prove the Runtime Protocol and DevTools preserve `waiting` instead of translating it back to
   generic progress.

## Scope

1. Add `waiting` to the canonical Task lifecycle and Task Run Entity projection.
2. Make native explicit execution and LangGraph publish `waiting` when an Interaction is persisted.
3. Make Interaction claiming return the run atomically to `running` in in-memory and Supabase Task
   Storage implementations.
4. Apply the same visible lifecycle to process-local Interactions without claiming restart safety.
5. Carry `waiting` through Runtime Protocol parsing, Runtime Transport consumers, React lifecycle,
   and DevTools.
6. Add conformance assertions for native and LangGraph restart-safe wait/resume.
7. Update durable model documentation and the parent Plan 154 evidence.

## Non-Goals

1. No public `Program<T>`, `Wait<T>`, `Event<T>`, `await`, `emit`, or `onEach` API.
2. No first-class domain Event protocol before Plan 146j.
3. No Assistant, Session, conversation-memory, or actor framework.
4. No Vercel Workflow Interaction implementation; Plan 153e owns that missing adapter capability.
5. No serialization of JavaScript closures or stacks.
6. No richer participant delegation policy, timeout scheduler, cancellation command, or general
   idempotency framework.
7. No claim that legacy function-style Interactions survive process loss.

## Execution Slices

### Slice 1: Explicit lifecycle

- [x] Add `waiting` to Task status reflection and protocol validation.
- [x] Persist `waiting` together with a pending explicit Interaction.
- [x] Atomically return a claimed Interaction to `running`.
- [x] Preserve invalid, unauthorized, duplicate, and concurrent-response behavior.

### Slice 2: Two-runtime proof

- [x] Prove choice and approval wait/resume after native runtime recreation.
- [x] Prove the same lifecycle after LangGraph runtime and persistent checkpointer recreation.
- [x] Keep provider replay state private to the LangGraph adapter.
- [x] Record Vercel Workflow as explicitly unsupported rather than silently degrading semantics.

### Slice 3: Consumers and inspection

- [x] Preserve `waiting` through Runtime Protocol inspect and observation.
- [x] Keep React observation open while a Task is waiting.
- [x] Present waiting, progress, resumed execution, and terminal outcome distinctly in DevTools.
- [x] Update Atlas models with the proven continuation and lifecycle boundary.

## Acceptance Checklist

- [x] A pending explicit Interaction always has `status: 'waiting'`.
- [x] A claimed response is reflected as `running` before continuation work executes.
- [x] Native and LangGraph runtimes resume the same typed wait after recreation.
- [x] Exactly one concurrent valid response advances the continuation.
- [x] Wrong response identity, invalid value, and unauthorized actor leave the wait intact.
- [x] Runtime Protocol, React, and DevTools accept and preserve `waiting`.
- [x] Query observation, Operation progress, Interaction wait, and Event reaction remain distinct.
- [x] No new general wait or Event abstraction is introduced without behavioral evidence.
- [x] Public package changes include Changesets and affected package verification.

## Closure

The existing explicit Task execution boundary paid rent as the durable continuation model. No new
semantic wait term was required. The public lifecycle now distinguishes active evaluation from an
external wait, and both native and LangGraph runtimes preserve the same transition across runtime
recreation. Provider checkpoint and replay mechanics remain adapter-private.

Runtime Protocol rejects contradictory snapshots: `waiting` requires one pending Interaction, and
an Interaction cannot appear under another status. React keeps the observation alive and exposes
`isWaiting`; DevTools continues to name the concrete choice, input, or approval instead of reducing
it to generic progress.

This result does not validate a general Event model. Domain event declaration, delivery,
acknowledgement, replay, ordering, and persistent `onEach` reactions remain gated by Plan 146j.

## Deferred Boundaries

1. Plan 153e owns Vercel Workflow Interaction resumption.
2. Plan 132 owns durable invocation and external-effect idempotency policy.
3. Plan 146j owns first-class Event declaration and delivery semantics.
4. A later continuation slice may add timeout and cancellation commands once their authority and
   scheduler ownership are concrete.
