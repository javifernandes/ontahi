---
id: ontahi.source-code-organization.runtime-langgraph
kind: artifact
title: @ontahi/runtime-langgraph
parent: ontahi.source-code-organization
status: experimental
horizon: now
supports:
  - ontahi.durable-workflows
  - ontahi.model.operation-interaction
relatedPlans:
  - ontahi://plans/153c-operation-interactions-and-resumption
  - ontahi://plans/153d-langgraph-task-runtime-comparison
---

`@ontahi/runtime-langgraph` is the optional LangGraph execution adapter for Ontahí explicit durable
Tasks. It compares a third-party workflow engine against the same Operation, Task, Interaction,
Task Storage, Runtime Protocol, and Devtools contracts used by the native runtime.

Ontahí owns public run identity, lifecycle snapshots, authority checks, pending Interactions,
response claiming, and typed execution transitions. The package owns the translation to a private
LangGraph state graph, thread, interrupt/resume cycle, and injected checkpointer. Provider objects
and Commands do not cross into Core contracts.

The adapter delegates legacy function-style Tasks to the in-process executor. This keeps the
comparison scoped to explicit state machines and avoids implying that an arbitrary suspended
JavaScript function can survive restart.

Recovery treats the Ontahí execution checkpoint as authoritative. When the private provider thread
is absent or its execution state differs, the adapter clears that thread and rebuilds it from
`TaskStorage`. A response claimed before provider persistence recreates the corresponding interrupt
before issuing the LangGraph resume Command. Explicit step effects still require replay-safe design
because the two stores do not share a transaction.
