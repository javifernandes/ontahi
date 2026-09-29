# `@ontahi/runtime-langgraph`

Optional LangGraph.js execution adapter for explicit Ontahí durable Tasks.

Ontahí remains the owner of Operation identity, typed inputs and outputs, Task lifecycle,
Interactions, authorization, Runtime Protocol, and public snapshots. LangGraph supplies an internal
state graph, thread checkpoint, replay, and interrupt/resume mechanism. LangGraph nodes, Commands,
thread IDs, and interrupt payloads do not become public Ontahí contracts.

```ts
import { MemorySaver } from '@langchain/langgraph';
import { ontahi } from '@ontahi/core/runtime/server';
import { langGraphTasks } from '@ontahi/runtime-langgraph';

const application = ontahi({
  storage,
  tasks: langGraphTasks({ checkpointer: new MemorySaver() }),
  entities,
});
```

The adapter executes Tasks with an explicit `execution` definition through LangGraph. Legacy Task
functions are delegated to Ontahí's in-process executor, allowing an application to compare
runtimes without rewriting unrelated Operations.

## Persistence

Inject any LangGraph `BaseCheckpointSaver`. `MemorySaver` is useful for local interaction testing.
For restart testing, install `@langchain/langgraph-checkpoint-sqlite` and inject a `SqliteSaver`; a
production host can provide another durable checkpointer.

Task storage and the LangGraph checkpointer have different responsibilities:

- `TaskStorage` is the source for public lifecycle, progress, Interaction, result, and Activity;
- the LangGraph checkpointer owns provider replay state under an internal thread ID derived from
  the Ontahí Task Run identity;
- the private Task execution checkpoint retains claimed interaction responses needed to reconstruct
  that provider thread when its checkpoint is missing or stale;
- a response is authorized and atomically claimed through `TaskStorage` before LangGraph receives a
  resume Command.

On recovery, the adapter compares the provider state with the authoritative Ontahí execution
checkpoint. A missing or stale LangGraph thread is discarded and rebuilt from `TaskStorage`; a
claimed response first replays earlier interactions, verifies the pending interrupt identity, and
then resumes it.

Explicit steps may be replayed after failure, so application effects still require appropriate
idempotency. The adapter is an execution comparison and does not add an LLM, agent loop, LangSmith,
or model memory.
