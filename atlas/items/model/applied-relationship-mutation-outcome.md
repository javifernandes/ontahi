---
id: ontahi.model.applied-relationship-mutation-outcome
kind: concept
title: Applied Relationship Mutation Outcome
parent: ontahi.model.applied-mutation-outcome
typeOf: ontahi.model.applied-mutation-outcome
status: active
horizon: now
supports:
  - ontahi.model.applied-mutation-outcome
  - ontahi.model.relation
relatedPlans:
  - ontahi://plans/135-applied-mutation-outcomes-and-reactions
  - ontahi://plans/136g-portable-relationship-command-outcomes
---

An Applied Relationship Mutation Outcome is the Relationship Command variant of
[[ontahi.model.applied-mutation-outcome|Applied Mutation Outcome]]. Its
`mutationKind: 'relationship-command'` discriminator pairs the exact canonical Relationship
Command with the Relationship Delta or Ordered Relationship Delta that the runtime applied.

The outcome preserves semantic edge changes rather than exposing adapter rows. Its causal identity
allows a Reaction to relate follow-up work to the root and parent outcomes without turning the
outcome itself into an Entity or public Domain Event.
