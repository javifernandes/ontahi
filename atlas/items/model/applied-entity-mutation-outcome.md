---
id: ontahi.model.applied-entity-mutation-outcome
kind: concept
title: Applied Entity Mutation Outcome
parent: ontahi.model.applied-mutation-outcome
typeOf: ontahi.model.applied-mutation-outcome
status: active
horizon: now
supports:
  - ontahi.model.applied-mutation-outcome
  - ontahi.model.entity
relatedPlans:
  - ontahi://plans/135-applied-mutation-outcomes-and-reactions
  - ontahi://plans/138-entity-mutation-command-authoring
---

An Applied Entity Mutation Outcome is the Entity Mutation Command variant of
[[ontahi.model.applied-mutation-outcome|Applied Mutation Outcome]]. Its
`mutationKind: 'entity-mutation-command'` discriminator pairs the exact Entity Mutation Command
with the Entity Mutation Delta produced by create, update, or delete.

Association Entities use this same variant. The outcome describes an applied semantic transition;
it is a Value in the runtime result and causality model, not a persisted Entity or an implicit
public Domain Event.
