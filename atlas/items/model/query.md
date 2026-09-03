---
id: ontahi.model.query
kind: concept
title: Query
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model.selection
  - ontahi.data-graph-execution-routing
relatedPlans:
  - bookops://plans/55-runtime-agnostic-data-graph-and-pluggable-adapters
  - ontahi://plans/116-ontahi-selection-model
  - ontahi://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/model/query
sourceCommit: 67713696
---

A [[ontahi.model.query|Query]] is a storage-neutral read program over an Entity set. A
[[ontahi.model.selection|Selection]] supplies membership; the Query adds projection, relation
includes, ordering, limits, cardinality, aggregation, or another read mode.

```ts
const openItems = TodoItem.selection(item => item.completed.eq(false));

await openItems
  .select(item => ({ id: item.id, title: item.title }))
  .orderBy(item => item.title)
  .run();
```

The bound runtime interprets the Query through in-memory, PostgreSQL, Supabase, or another adapter.
The program does not contain SQL or provider calls. Transporting the same Query through a remote
Data Graph executor is an active direction; the stable concept does not require wrapping an
ordinary read in a Domain Operation.
