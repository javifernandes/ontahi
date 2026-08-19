---
id: ontahi.model.reaction
kind: concept
title: Reaction
parent: ontahi.model.applied-mutation-outcome
status: active
horizon: now
supports:
  - ontahi.model.applied-mutation-outcome
  - ontahi.model.operation-invocation
relatedPlans:
  - ontahi://plans/135-applied-mutation-outcomes-and-reactions
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
---

A [[ontahi.model.reaction|Reaction]] is a modeled rule that consumes an Applied Mutation Outcome and
yields zero or more declarative follow-up intents. It begins after the parent mutation has been
applied and therefore cannot implicitly become part of that mutation's atomic validity boundary.

Reactions belong to the application/runtime model rather than to arbitrary Entity-field or Relation
callbacks. Their follow-up Commands and Operation Invocations pass through normal validation,
authorization, causality, and execution boundaries.

Opaque executable effects may remain as a compatibility escape hatch, but they are not portable
Reaction semantics: they cannot be serialized, reflected, remotely interpreted, or inspected as
intent.
