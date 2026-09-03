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
  - bookops://plans/90-event-driven-architecture-runtime
migratedFrom: bookops://atlas/durable-workflows
sourceCommit: 67713696
---

Durable Workflows cover long-running tasks, retries, event-driven execution, workflow tiers, and the runtime machinery needed for imports, sync, and agent-assisted work.

Ontahi separates durable execution from message transport. Vercel Workflow, DBOS, Restate, and Temporal are execution-engine adapter candidates; RabbitMQ and similar brokers can transport jobs or events but do not by themselves provide workflow journals, durable timers, step replay, or task lifecycle state.

Durable operation metadata is the source for task definitions and adapter projections. The Vercel adapter derives statically discoverable workflow and step entrypoints from the analyzed application model; applications configure concrete stores, runtime composition, output files, and optional host step runners.

`TaskRun` is currently a unified application Entity in BookOps. The durable runtime should
eventually supply the standard semantic TaskRun Entity and operations while the application selects
execution and storage adapters. This is a runtime-ownership evolution, not a reason to retain the
completed semantic-convergence umbrella.
