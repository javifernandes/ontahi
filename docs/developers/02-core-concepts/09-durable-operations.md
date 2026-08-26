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

while (snapshot.status === 'queued' || snapshot.status === 'running') {
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
    Tasks-->>Server: queued / running / completed
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

Today, `useDurableOperation` polls task snapshots through the configured bridge. It stops at
`completed`, `failed`, or `cancelled` and exposes the latest snapshot as lifecycle state. Polling is
the current portable baseline, not a generic stream abstraction.

The conventional React client already observes `/operations/tasks`. A host with custom paths
configures the client bundle once:

```ts
const client = createFetchGraphClient({
  operations: {
    endpoint: '/runtime/ontahi/operations',
    taskEndpoint: '/runtime/ontahi/operations/tasks',
  },
});
```

The provider passes that task observer to `useDurableOperation`; individual bridge adapters remain
available as a lower-level override. The Express adapter exposes both endpoints from the same
composed application. A future
push-capable observer can preserve the `TaskRunRef` and snapshot contract, but the current public
hook uses polling.

## The runtime defines the guarantee

`inProcessTasks()` is the smallest executable runtime. It starts background work and stores task
state locally; it does not promise to survive a process restart.

A persistent executor and task store can carry the same lifecycle across retries, processes, and
deployments. Ontahí's Vercel Workflow adapter is one such runtime. The host owns provider setup,
persistent task storage, credentials, and deployment artifacts; the durable operation remains the
semantic source for its lifecycle schemas.

Use durable steps only where the workflow has a real internal boundary that needs its own typed
input and output. Retry, replay, and cancellation are explicit runtime or application operations;
they are not hidden side effects of starting a durable operation.
