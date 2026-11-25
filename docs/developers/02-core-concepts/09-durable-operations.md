# Durable Operations

A \concept{Durable Operation} is a domain operation whose work continues beyond its initial invocation.
Starting it returns the identity of a run. Progress, completion, and failure are observed through
that run.

## Declare one lifecycle

`completeAll` declares its eventual output and progress alongside the operation:

```ts
const CompleteAllProgress = value('CompleteAllProgress', {
  phase: f.enum(['updating'] as const),
});

const CompleteAllOutput = value('CompleteAllOutput', {
  completed: f.nonNegativeInteger(),
});

completeAll: operation({
  output: CompleteAllOutput,
  durable: {
    runtime: 'in-process',
    progress: CompleteAllProgress,
  },
  run: runCompleteAll,
}),
```

The input schema, contracts, requirements, progress schema, and final output remain one operation
contract. Ontahí projects the task definition that the configured runtime executes.

The operation body receives a task context when the runtime runs it. It can report progress, sleep
without hiding timing semantics, and execute declared steps. In this example `runCompleteAll`
reports the `updating` phase, completes the open Todos, and returns `CompleteAllOutput`.

> [!MARGIN] **One operation, not a command plus a job.** A queue-based application often repeats
> the same use case as an endpoint contract, job payload, status record, and polling DTO. Ontahí
> projects those runtime shapes from the durable operation's lifecycle contract instead of asking
> the application to author a second model.

## Start and follow it from Node

```ts
import { setTimeout as wait } from 'node:timers/promises';
import { TodoItem, TodoApplication } from './graph.js';

const started = await TodoItem.completeAll();
if (!started.ok) throw new Error(started.message);

const run = started.value;
let snapshot = await TodoApplication.getTaskSnapshot(run);

while (
  snapshot.status === 'queued' ||
  snapshot.status === 'running' ||
  snapshot.status === 'waiting'
) {
  await wait(500);
  snapshot = await TodoApplication.getTaskSnapshot(run);
}

console.log(snapshot.status, snapshot.result ?? snapshot.error);
```

`started.value` is a `TaskRunRef`: `taskId`, `runId`, and the status at acceptance. It is not the
final `CompleteAllOutput`.

The snapshot carries the current status, progress, eventual result, or run error. Keeping the Ref
separate lets another process, request, or screen resume observation without restarting the work.

The lifecycle crosses runtimes without changing its identity:

```mermaid
sequenceDiagram
  participant Client
  participant Server as Application server
  participant Tasks as Task runtime and store
  participant Worker as Durable worker
  participant DB as Application database

  Client->>Server: start TodoItem.completeAll
  Server->>Tasks: create run
  Tasks-->>Server: TaskRunRef
  Server-->>Client: accepted TaskRunRef
  Tasks->>Worker: execute or resume
  Worker->>DB: Queries and Commands
  Worker->>Tasks: progress and final result

  loop observe run
    Client->>Server: get snapshot(TaskRunRef)
    Server->>Tasks: read snapshot
    Tasks-->>Server: queued / running / waiting / completed
    Server-->>Client: snapshot
  end
```

Acceptance, execution, persistence, and observation may happen in different processes. The
`TaskRunRef` is what keeps them one run.

## Observe the same run from React

```tsx
const completeAll = useDurableOperation(TodoItem.domain.completeAll);

return (
  <div>
    <button disabled={completeAll.isExecuting} onClick={() => completeAll.execute()}>
      Complete all
    </button>

    {completeAll.value && <small>Run {completeAll.value.runId}</small>}
    {completeAll.isQueued && <p>Queued…</p>}
    {completeAll.isRunning && <p>{completeAll.progress?.phase ?? 'Running…'}</p>}
    {completeAll.isWaiting && <p>Waiting for a response…</p>}
    {completeAll.isCompleted && <p>Completed {completeAll.finalValue?.completed ?? 0} Todos.</p>}
    {completeAll.isFailed && <p>{completeAll.runError?.message}</p>}
  </div>
);
```

`value` is the accepted run Ref. `finalValue` is the typed eventual output. The hook keeps start
failure separate from run failure: a failed invocation creates no run; an accepted run may later
reach `failed` or `cancelled`.

Reads invalidated by the operation become stale after successful completion, not merely after the
runtime accepts the start request.

## Snapshots are the observation contract

The Runtime Protocol represents observation as a versioned `durable.operation` request. Starting
the work remains `operation.invoke`; after receiving its `TaskRunRef`, a runtime can inspect that
identity:

```ts
{
  version: 1,
  kind: 'inspect',
  run: { taskId: 'Todo.completeAll', runId: 'run-1' },
}
```

The response is a versioned `snapshot` containing queued, running, waiting, completed, failed, or
cancelled state plus progress, a pending Interaction, result, or error when present. `waiting`
means execution has checkpointed one exact typed Interaction and cannot continue until an
authorized response is claimed. Claiming that response returns the run to `running` before its
continuation executes. Progress, Interaction, and result are snapshot states, not commands.
Repeating `inspect` is the portable polling primitive.

The React boundary is one Runtime Transport observer. `useDurableOperation` consumes its
asynchronous snapshot sequence; the transport chooses how to produce it from its capabilities. The
Fetch transport polls with repeated `inspect` requests and stops at `completed`, `failed`, or
`cancelled`. The WebSocket transport subscribes once and receives the same snapshots by push,
without changing component code, lifecycle state, or completion-time cache invalidation.

Polling cadence belongs to Fetch configuration, not the hook:

```ts
const client = createFetchGraphClient({
  runtimeTransport: {
    endpoint: '/runtime/ontahi/runtime',
    durableOperation: { pollIntervalMs: 750 },
  },
});
```

Or select pushed observation explicitly:

```ts
const runtimeTransport = createWebSocketRuntimeTransport({ url: '/runtime' });
const client = createRuntimeGraphClient({ runtimeTransport });
```

The WebSocket observer releases the session subscription when the hook aborts or a terminal
snapshot arrives. It ignores duplicate, out-of-order, mismatched-run, and post-terminal delivery.
A disconnect ends active observation without replay or automatic resubscription; WebSocket alone
does not imply durability or exactly-once delivery. A host whose Task Runtime only supports
inspection may poll on the server and push changed snapshots, while the browser still performs no
polling.

The conventional same-origin client uses `POST /runtime` for invocation, Graph Read, Graph Command,
and inspection. `OntahiGraphProvider` exposes the same Runtime Transport capability consumed by the
Durable hook. Express requires an explicitly configured common dispatcher and trusted
request-context factory before mounting that path; it does not expose Task state automatically.
The legacy Task snapshot GET remains only as a bounded compatibility surface during endpoint
migration.

## The runtime defines the guarantee

`inProcessTasks()` is the smallest executable runtime. Ordinary task functions still depend on the
process that started them. Explicit step executions persist a versioned JSON checkpoint, including
pending interactions, through the configured `TaskStorage`. A pending Interaction is exposed as a
`waiting` run rather than as contradictory running progress. With persistent storage, a freshly
started application can register the same Task definitions and resume an interaction response from
that checkpoint. Inspecting or observing a running execution also resumes a checkpoint that was
persisted just before the previous process stopped. Interaction responses are claimed once through
the task store, atomically returning the run to `running`, before execution continues. A step can
be evaluated again after a crash, so side effects still need the same idempotency care as other
retryable work.

A persistent executor and task store can carry the same lifecycle across retries, processes, and
deployments. Ontahí's Vercel Workflow adapter is one such runtime. The host owns provider setup,
persistent task storage, credentials, and deployment artifacts; the durable operation remains the
semantic source for its lifecycle schemas.

Use durable steps only where the workflow has a real internal boundary that needs its own typed
input and output. Retry and replay remain explicit runtime or application operations; they are not
hidden side effects of starting a durable operation. `cancelled` can already be observed in a
snapshot, but Ontahí does not yet expose a cancellation request because its Task Runtimes do not
share an enforceable cancellation capability.

## Admit a run and protect its external effects

A durable Operation can set `idempotency.policy` to `reuse-running` or `skip-if-completed`
with the native executor and in-memory or PostgreSQL Task Storage. Both policies reuse a queued,
running, or waiting run. After completion, only `skip-if-completed` reuses that run. An ordinary
failed or cancelled run releases the key. A run with an ambiguous external effect retains the
key and returns `reconciliation-required` on another matching invocation.

Use `idempotency.key(input)` for a business-defined equivalence key. It takes precedence over a
trusted webhook delivery identity. Keys are scoped by Operation and invocation authority. Run
references distinguish `created`, `reused`, `already-completed`, and
`reconciliation-required` for these policies. Apply the updated Task schema when using PostgreSQL.

For a provider that accepts idempotency keys, declare the effect with
`defineIdempotentTaskEffect({ id, retryWindowMs, execute })`. In explicit Task execution, call
`prepare(context, occurrence, input)` and return a `continue` transition with the prepared
value in its state. The next step calls `run(prepared)`. The persisted checkpoint carries the
provider key and input across worker recreation. Give separate logical calls separate occurrence
identities. Configure a conservative retry window supported by the provider.

A worker can send the same effect request more than once. The provider must enforce its contract
for the same key and input. If the window expires, the Task retains the checkpoint and records
an ambiguous outcome for reconciliation. The effect declaration covers that capability's calls.
List the helper's `metadata` in `durable.externalEffects` to expose that declared contract in
reflection. Coverage of other effects in arbitrary TypeScript remains unverified.

### Reconcile by external reference

For an API with a reference lookup, use `effect.reconcilable({ lookup, execute })`.
The declaration ID is optional. Give each logical use a stable occurrence unique within its Task
run. For repeated uses, derive the occurrence from a business key. Persist the prepared value in
an explicit Task checkpoint before running the effect. The helper
looks up that reference before writing and recovers any matching record. After an uncertain
write, it reconciles and issues at most one retry per execution of the helper. If that retry fails, it looks up the reference
once more. An inconclusive or unavailable lookup leaves the Task pending reconciliation.

Have the adapter report expected HTTP and transport failures in the Effect error channel.
Return `confirmed-absent` only when the provider contract establishes that the record does
not exist and no earlier write can still commit for that reference. A search miss after a
timeout from an eventually consistent API is `unknown`. Compare the returned record and expected
input before returning `found`. Lookup and creation are separate provider actions. Hosts that
run competing workers need exclusive execution for the effect or a provider guarantee that
prevents conflicting creates for the same reference.
