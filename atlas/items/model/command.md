---
id: ontahi.model.command
kind: concept
title: Command
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model.selection
  - ontahi.data-graph-execution-routing
relatedPlans:
  - bookops://plans/53-entity-targets-and-mutations
  - bookops://plans/55-runtime-agnostic-data-graph-and-pluggable-adapters
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/model/command
sourceCommit: 67713696
---

A [[ontahi.model.command|Command]] is a storage-neutral program that changes Entity state. It names
an insert, upsert, update, or delete; the semantic target and payload; cardinality; and any returned
shape.

Selections expose the common fluent form directly:

```ts
await staleItems.update({ archived: true }).run();
await selectedItems.delete().run();
```

The Selection already carries its Entity and membership, and a `one` contract already carries its
cardinality, so the Command need not reconstruct those facts through `commands.where(...)` or
repeat `updateOne` in ordinary cases. The lower-level builder remains available for multi-step
operation implementations.

A Command is not automatically a [[ontahi.model.domain-operation|Domain Operation]]. Operations
add named intention, contracts, policy, invariants, coordination, effects, or lifecycle. A plain
data change remains a Command even when runtime topology eventually transports it to a server.
