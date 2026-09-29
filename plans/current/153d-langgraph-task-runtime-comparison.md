# 153d. LangGraph Task Runtime Comparison

Status: current

Canonical ID: `ontahi://plans/153d-langgraph-task-runtime-comparison`

Parent: [153c. Interactive And Resumable Operation Execution](./153c-operation-interactions-and-resumption.md)

Shapes: [Operation Interaction](../../atlas/items/model/operation-interaction.md),
[Durable Operation](../../atlas/items/model/durable-operation.md).

## Goal

Run the existing explicit Ontahí Task execution contract through a small LangGraph.js adapter,
without exposing LangGraph graphs, nodes, threads, Commands, or interrupt payloads as Ontahí's
public model. The same Todo durable Operation must run through either the native in-process executor
or LangGraph while preserving the existing Runtime Protocol, Task snapshots, Interaction requests,
authority checks, and Devtools surfaces.

This is a runtime comparison, not an agent or LLM integration. Ontahí owns the semantic execution
definition and LangGraph supplies checkpoint, replay, and interrupt mechanics.

## Scope

1. Add an optional `@ontahi/runtime-langgraph` package implementing the existing Task runtime
   boundary.
2. Map an Ontahí Task Run identity to an internal LangGraph thread identity.
3. Project named explicit steps into LangGraph execution and map Ontahí choice and approval
   Interactions to interrupt/resume internally.
4. Keep provider checkpoints opaque; public state continues to come from `TaskStorage` and
   `TaskSnapshot`.
5. Support an injected LangGraph checkpointer, with a SQLite-backed local configuration for restart
   testing.
6. Let the Todo example select the native or LangGraph runtime without changing
   `TodoItem.deleteFromNamedList`.
7. Exercise invocation, ambiguous-list choice, approval, rejection, stale-proposal failure,
   restart/resume, duplicate response, and final graph effects through the canonical Runtime
   Protocol.
8. Record the native-versus-LangGraph evidence and the resulting lifecycle decision in plan 153c.

## Acceptance

- [x] No LangGraph type or provider-specific command appears in Core Operation, Interaction, Task,
      or Runtime Protocol contracts.
- [x] The existing Todo explicit execution definition runs unchanged through both runtimes.
- [x] Choice and approval are observable and answerable through `durable.operation`.
- [x] A persistent checkpointer resumes a pending Interaction after runtime recreation.
- [x] Ontahí rejects invalid, unauthorized, and mismatched responses and prevents duplicate
      continuation.
- [x] The same approved proposal produces the same graph effects in both runtimes.
- [x] Devtools requires no LangGraph-specific presentation or transport path.
- [x] The comparison and architectural conclusion are written back to plan 153c.

## Implementation Evidence

The adapter consumes the same `TaskExecutionDefinition` used by the native in-process runtime.
Core owns execution-state validation, Interaction materialization, response validation, actor
authorization, and atomic response claiming. LangGraph supplies the internal graph loop,
`interrupt`/`Command` replay, thread identity, and an injected checkpointer. No provider type appears
in Ontahí's Operation, Task, Interaction, snapshot, or Runtime Protocol contracts.

The first implementation uses two persistence layers intentionally. `TaskStorage` is authoritative
for the public run, checkpoint, pending Interaction, claimed response, authority, and result.
LangGraph's checkpointer is private replay state addressed by an internal thread ID derived from the
Task Run identity. They do not share a transaction. Resume first claims the response in
`TaskStorage`; replay may then safely re-enter the LangGraph node without publishing or executing a
second public continuation. Recovery compares provider execution state with the authoritative
Ontahí checkpoint, including the pending interrupt identity. The private execution checkpoint keeps
the claimed response trail required to discard and rebuild a missing or stale provider thread,
recreate consecutive interrupts, and resume the current response. The stores remain
non-transactional, so effects inside replayed steps still require idempotency.

The existing Todo operation selects the adapter through `TODO_TASK_RUNTIME=langgraph`; its explicit
steps and Devtools protocol path are unchanged. The test matrix includes choice, approval,
rejection, stale proposal detection, concurrent responses, actor denial, runtime recreation, and a
SQLite checkpointer reopened by a new adapter instance. It also covers recovery when Task Storage
has advanced to a second same-state interaction while the provider still exposes the first.

## Conclusion

LangGraph is compatible as an implementation of Ontahí's Task Runtime boundary. It does not replace
that boundary or define a second public Operation kind. The explicit step machine is the stable
semantic contract; the native runtime and LangGraph are alternate execution adapters. This result
supports implementing the same contract in Vercel Workflow next and evaluating a queue-backed
adapter later.

LangGraph provides useful checkpoint and interrupt machinery, but it does not remove Ontahí's need
for Task Storage, authority, response claiming, Runtime Protocol, or application context
reconstruction. The comparison therefore favors keeping the adapter optional and technology
specific.

## Non-goals

- Model calls, agent loops, tool calling, LangSmith, hosted LangGraph deployment, and long-term model
  memory.
- Completing the Vercel Workflow or queue-backed runtimes in this slice.
- Treating a LangGraph thread ID as a Principal, interaction session, or public Ontahí run identity.
