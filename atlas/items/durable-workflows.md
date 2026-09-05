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
