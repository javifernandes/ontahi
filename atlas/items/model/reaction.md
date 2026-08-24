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
  - ontahi://plans/135b-declarative-reaction-authoring-and-registration
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

Delivery policy is independent from the follow-up intent. Inline and best-effort delivery may
attempt local interpretation after application. Durable delivery submits a serializable envelope to
a runtime capability and reports acceptance separately from execution. Acceptance means the
runtime took responsibility for the intent; it does not mean the follow-up has completed.

The first portable intent vocabulary includes Relationship Commands, Operation Invocations, and
Domain Events. Each is interpreted through its normal runtime capability so a Reaction does not
bypass validation or authorization. Durable envelopes accept only JSON-safe intent and never carry
opaque executable functions.

Applications register Relationship Reactions through `ontahi({ reactions })`. The
`reaction.relationship(Entity, relationName).added(...)` and `.removed(...)` factories normalize
forward and inverse authoring to the canonical Relation identity. Their `.then(...)`, `.emit(...)`,
and `reaction.intent` helpers produce the existing execution IR; Relation reflection remains free
of executable callbacks. Deferred registration is evaluated once after Entity references resolve,
then non-empty unique ids and canonical matchers are fixed for the application lifetime.

A bound Relationship Command returns `{ status: 'applied', outcome, reactions }` at the application
surface while provider runtimes continue to return the exact Relationship Delta. Root provider
failure remains in the Effect error channel. Reaction evaluation or follow-up failure remains
evidence attached to the applied result instead of retroactively failing the parent.

Inside a compositional Data Graph transaction, application registration does not run a Reaction
against an uncommitted fact. Ontahi records the transaction-local outcome and queues interpretation
on the child UnitOfWork. A successful provider commit drains that queue against the restored parent
runtime before the outer transaction returns; rollback discards it. This is local after-commit
ordering, not a durable outbox or an exactly-once guarantee.
