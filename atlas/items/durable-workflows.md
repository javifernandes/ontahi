---
id: ontahi.durable-workflows
kind: system-primitive
title: Durable Workflows
parent: ontahi
status: shaping
horizon: next
supports:
  - ontahi
  - bookops
relatedPlans:
  - bookops://plans/46c-durable-workflow-runtime
  - bookops://plans/70-first-class-workflow-tier-in-architecture
  - ontahi://plans/100d-ontahi-vercel-workflow-runtime-boundary
  - ontahi://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - ontahi://plans/128h-observable-query-runtime-and-durable-progress
  - ontahi://plans/153d-langgraph-task-runtime-comparison
  - ontahi://plans/153e-vercel-workflow-interaction-resumption
  - ontahi://plans/153f-queue-backed-task-runtime
  - ontahi://plans/155-adapter-capability-completeness
  - ontahi://plans/155a-vercel-workflow-event-waits
  - bookops://plans/90-event-driven-architecture-runtime
migratedFrom: bookops://atlas/durable-workflows
sourceCommit: 67713696
---

Durable Workflows cover long-running tasks, retries, event-driven execution, workflow tiers, and the runtime machinery needed for imports, sync, and agent-assisted work.

Ontahi separates durable execution from message transport. Vercel Workflow, DBOS, Restate, and Temporal are execution-engine adapter candidates; RabbitMQ and similar brokers can transport jobs or events but do not by themselves provide workflow journals, durable timers, step replay, or task lifecycle state.

Durable operation metadata is the source for task definitions and adapter projections. The Vercel adapter derives statically discoverable workflow and step entrypoints from the analyzed application model; applications configure concrete stores, runtime composition, output files, and optional host step runners.

Core supplies a standard semantic `TaskRun` Entity with composite `(taskId, runId)` identity and a
public `TaskSnapshot` projection. Runtime engine input, trigger, and source records remain behind the
Task storage boundary. The in-process runtime projects committed lifecycle writes into an observable
TaskRun Query. In-process runtime instances over the same Task storage share that projection, so an
Operation executor and a protocol observer see the same writes without inspecting storage. The
Runtime Protocol adapts the native Stream to Durable snapshots; other execution and storage adapters
may provide native observation or explicitly use the polling compatibility adapter.

Task Storage is an adapter-author boundary independent from execution engines. Core's shared
conformance proof covers private source persistence, public snapshot and listing projections,
runtime recreation, canonical duplicate behavior, actor scoping, and exclusive Interaction and
Event-wait claims. `@ontahi/postgres/tasks`, `@ontahi/mysql/tasks`, and
`@ontahi/supabase/tasks` persist restart-safe checkpoints and use conditional database updates so
concurrent application processes cannot both claim one pending continuation. Supabase owns that
conditional update in an invoker-rights PostgREST RPC, preserving table grants and RLS; it does not
claim native observation. The MySQL implementation uses InnoDB and exact binary identities. No
adapter makes the Task lifecycle atomic with Data Graph mutations or Event acceptance merely
because its concerns can share physical infrastructure.

The Vercel Workflow executor supports both canonical Interaction waits and durable Event waits for
explicit Task executions. Interactions map to private native hooks after an atomic Task Storage
claim. Event waits retain their distinct semantics: the workflow registers and claims a stable
Event Runtime delivery, Task Storage chooses the single continuation winner, and the canonical
occurrence resumes the existing state machine. Provider identities remain adapter-private in both
paths.
