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
  - ontahi://plans/128h-observable-query-runtime-and-durable-progress
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

A bound Query may also be observed when its runtime supplies that capability. `stream()` retains
its existing meaning of yielding the rows from one execution; `observe()` yields repeated complete
Query results as committed changes alter the current value. In-memory notifications, database
triggers or change capture, provider-native subscriptions, workflow streams, and explicit polling
adapters may all drive the same observation without entering the Query program.

Query observation describes current state and may coalesce changes before reevaluation. It is not
an Event declaration, provider changefeed, audit log, or promise that every intermediate mutation
will be delivered. Remote transports project the observation capability while preserving Query
identity, authority, cancellation, and source guarantees.

The Runtime Protocol WebSocket projection transports the same Graph Read program in `run` mode and
pushes sequenced complete arrays. On the browser side, a Runtime Graph client reconciles each array
through the Graph Client Cache by Entity identity before the observation yields it. Ordinary
`useGraphQuery` reads remain finite; choosing a public React lifecycle for live Queries is a
separate API decision rather than an implicit subscription.
