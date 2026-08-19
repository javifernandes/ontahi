---
id: ontahi.model.applied-mutation-outcome
kind: concept
title: Applied Mutation Outcome
parent: ontahi.model.command
status: active
horizon: now
supports:
  - ontahi.model.command
  - ontahi.model.domain-operation
  - ontahi.model.operation-invocation
relatedPlans:
  - ontahi://plans/131-relationship-semantics
  - ontahi://plans/135-applied-mutation-outcomes-and-reactions
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
---

An [[ontahi.model.applied-mutation-outcome|Applied Mutation Outcome]] is a transport-neutral fact
recording what a runtime actually applied for a semantic mutation. It is distinct from the mutation
intent, an Operation result, and a public Domain Event.

For a Relationship Command, the outcome preserves the canonical command and exact Relationship
Delta. Future variants may represent ordinary insert, update, delete, and Operation-level
transitions without reducing them all to storage row changes.

An outcome can be consumed by a Reaction that yields declarative follow-up intents such as another
Command, an Operation Invocation, or a Domain Event. This keeps follow-up behavior generic while
leaving topology on Relation and invariant-preserving coordination inside Operation.

Post-application reaction failure does not mean that the parent mutation was rolled back. Durable
acceptance, retry, and idempotency require explicit runtime capabilities and Plan 132's identity
model.
