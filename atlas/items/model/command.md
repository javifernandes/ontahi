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
  - ontahi://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/128f-remote-identity-scoped-entity-mutation-commands
  - ontahi://plans/128g-supabase-exact-entity-mutation-commands
  - ontahi://plans/138a-client-entity-mutation-authoring
  - ontahi://plans/138b-conditional-exact-entity-mutations
  - ontahi://plans/146-ontahi-runtime-protocol
  - ontahi://plans/122-ontahi-developer-book
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

The first generic remote write uses the narrower portable Entity Mutation Command rather than
transporting arbitrary Selection Commands. It expresses create or an exact Ref-targeted
update/delete and returns one exact Entity Mutation Delta. At the server boundary, policy must opt
in the Entity, action, mutable Fields, returned Fields, and row scope; registration alone grants
nothing. Generated client Entity facades now author that same contract as `Entity.create(values)`,
`ref.update(values)`, and `ref.delete()`. A runtime-bound facade adds a non-enumerable `.run()` while
the serialized Command and Ref remain data-only. `mutateEntity(Entity)` remains the lower-level
constructor. An update/delete delta carries the exact Ref targeted by its Command; provider and
remote boundaries reject a fact for another Ref even when the Entity name matches. Bulk affected
sets, upsert, and authority-derived atomic scopes remain later work.
Direct Supabase execution lowers this same focused command
through one PostgREST mutation, declared Entity/Ref mappings, and exact returning cardinality under
the project's grants and RLS; this does not imply multi-command rollback.

Exact Ref-targeted update/delete may carry an `if` equality condition over stored Entity Fields.
The runtime combines identity and condition with the mutation atomically: one PostgreSQL statement,
one filtered Supabase request, or one in-memory mutation boundary. A zero-row result becomes the
single authority-safe `entity_mutation_condition_not_met` rejection; it does not classify the
target as missing, changed, replaced, or policy-hidden. Remote policy allowlists condition Fields
separately from writable and returned Fields. Conditional Commands use a fail-closed protocol
version so an older receiver cannot discard the condition and execute an unconditional mutation.
