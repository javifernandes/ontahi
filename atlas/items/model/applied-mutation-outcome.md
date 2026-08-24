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
Delta. Entity variants represent exact create, update, and delete transitions without reducing them
all to storage row changes; Operation-level outcomes remain future work.

Exact Entity Mutation Commands now contribute created, updated, and deleted Entity facts. This
includes Association Entities: creating an association produces an ordinary Entity outcome that may
feed further Reactions without requiring a special public Entity subtype or per-application
lifecycle plumbing.

An outcome can be consumed by a Reaction that yields declarative follow-up intents such as another
Command, an Operation Invocation, or a Domain Event. This keeps follow-up behavior generic while
leaving topology on Relation and invariant-preserving coordination inside Operation.

Post-application reaction failure does not mean that the parent mutation was rolled back. Durable
acceptance, retry, and idempotency require explicit runtime capabilities and Plan 132's identity
model.

Application-bound Relationship Commands expose the outcome as
`{ status: 'applied', outcome, reactions }` without changing provider or transport contracts that
return a Relationship Delta. When execution belongs to an outer Data Graph transaction, `applied`
first describes transaction-local application rather than a premature commit claim. Registered
Reactions are interpreted only after that transaction commits; rollback publishes neither their
effects nor their execution evidence.
