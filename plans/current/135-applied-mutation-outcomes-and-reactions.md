# 135. Applied Mutation Outcomes And Reactions

Status: current

Canonical ID: `ontahi://plans/135-applied-mutation-outcomes-and-reactions`

Implemented slices:

1. [135a. Selection-Valued Many-To-Many Core](../done/135a-selection-valued-many-to-many-core.md)

## Summary

Give every successfully applied mutation a generic semantic outcome and let the runtime interpret
explicit reactions to that outcome. A reaction may request another Command, invoke an Operation, or
emit an Event without hiding those actions inside an opaque callback.

```text
Mutation Intent
→ Applied Mutation Outcome
→ Reaction
→ Follow-up Intent(s)
→ Applied Mutation Outcome(s)
```

This generalizes the `Relationship Command → Relationship Delta → Applied Outcome` direction from
Plan 131 without turning Relation into a behavioral hook system.

## Motivation

Ontahi currently exposes three partially overlapping ways to express consequences of a mutation:

1. an Operation can return `withEffects(...)` with an `emit-event` intent;
2. an Operation can return an opaque `run-effect` intent;
3. application code can execute several Commands directly inside one `Effect` program.

The first is explicit but only attached to Operation success. The second is generic but cannot be
serialized, reflected, authorized, inspected, or replayed as semantic intent. The third is often
correct coordination, but it does not distinguish an invariant-preserving transition from a
post-application reaction.

Relationship semantics makes the missing boundary more visible. Assigning a relation has a precise
delta that other behavior may need to observe, but that behavior should not live on `Relation`
itself. The same need exists for ordinary insert, update, delete, Operation, and Association Entity
lifecycle mutations.

## Semantic Boundaries

### Coordination belongs inside an Operation

If a second mutation must succeed for the first mutation to be valid, both are one coordinated
domain transition. They belong inside an Operation and, when storage supports it, one transaction.

### Reaction begins after an applied outcome

A Reaction observes a fact that has already become true. Its failure cannot honestly retroactively
roll back or reclassify the primary mutation unless both were executed inside one earlier atomic
boundary. Examples include notifications, indexing, audit projections, analytics, and independent
follow-up workflows.

This means the current required effect behavior needs explicit treatment: a required intent can
fail after primary storage writes have happened while the enclosing Operation is reported as
failed. Ontahi must not imply transactional rollback at that boundary.

### Relation remains structural

Relation owns topology, cardinality, nullability, inverse identity, and structural actions. It does
not own arbitrary callbacks. Relationship outcomes may feed the same generic Reaction mechanism as
all other mutation outcomes.

### Association Entity remains an Entity

Creating or deleting an Association Entity produces ordinary Entity mutation outcomes. Those
outcomes may additionally project relationship facts for observation, but the projection must not
erase the Entity's attributes, identity, or lifecycle semantics.

## Proposed Vocabulary

### Applied Mutation Outcome

A transport-neutral, serializable record of what Ontahi actually applied. It should preserve the
canonical mutation identity, exact applied delta or result, causal identity, and authority
provenance. Runtime evidence such as a timestamp or storage revision appears only when guaranteed.

An outcome is a fact about application, not a request to mutate and not necessarily a public Domain
Event. A Reaction may translate it into a Domain Event when that is the appropriate contract.

### Reaction

A modeled rule that matches an Applied Mutation Outcome and yields zero or more declarative
follow-up intents. Reactions are registered at a runtime/application boundary, not attached as
arbitrary functions to Entity fields or Relations.

### Follow-up Intent

The first semantic set to evaluate is:

1. `execute-command` for a canonical Graph or Relationship Command;
2. `invoke-operation` for a canonical Operation Invocation;
3. `emit-event` for an explicit modeled event.

`run-effect` remains a compatibility escape hatch. It is not part of the portable semantic core
because it contains executable code rather than data.

The local experiment now interprets Relationship Commands, canonical Operation Invocation
requests, and Events through separate injected capabilities. An Operation result is recorded as
`completed` even when the result itself represents domain rejection or failure; the invocation
completed and its canonical result retains that distinction. Events are recorded as `emitted`.

The next local slice adds exact Entity Mutation Commands for `create`, `update(ref)`, and
`delete(ref)`. They carry Entity identity as data rather than an `EntityDefinition` and return exact
created, updated, or deleted facts. Mass mutation by arbitrary Selection remains outside this
contract until its remote policy surface is designed.

### Delivery Policy

Whether a follow-up is synchronous, attempted, durable, retried, or best-effort is orthogonal to
what the intent means. The current `try` wrapper is evidence for this distinction, but the policy
model must avoid promising exactly-once external effects.

The first local contract declares delivery on each Reaction:

1. `inline` interprets the intent synchronously after the parent outcome is applied and records the
   resulting child outcome or failure;
2. `best-effort` makes the same immediate local attempt without durable acceptance or retry
   guarantees;
3. `durable` does not execute the intent inline. It submits a serializable envelope carrying the
   Reaction identity, stable reaction key, source outcome, and intent to an injected durable
   acceptance capability.

`accepted` means the durable runtime took responsibility for the intent. It does not mean the
follow-up has run or succeeded. If that capability is missing or rejects the envelope, the parent
remains applied and the result records `acceptance-failed` evidence.

## Causality And Safety Constraints

1. Every follow-up outcome references its parent and root causal identities.
2. Runtimes detect cycles or enforce a bounded reaction depth.
3. Authorization applies to every follow-up intent; ambient authority is not silently widened.
4. Request, delivery, idempotency, run, and attempt identities remain owned by Plan 132 and are not
   collapsed into one reaction identifier.
5. Local reaction order is deterministic; global ordering is not promised without durable
   coordination.
6. A runtime exposes whether reactions are local, synchronously interpreted, or durably accepted.

## First Core Experiment

Keep the first slice transport-free and in memory:

1. define an `AppliedMutationOutcome` union beginning with Relationship Command outcomes;
2. preserve the canonical command and exact `RelationshipDelta` in that outcome;
3. define declarative Reaction matching and follow-up intent production;
4. interpret follow-up Relationship Commands through the existing guarded dispatcher;
5. preserve parent/root causality and enforce a small configurable maximum depth;
6. prove forward and inverse syntax still produce the same observable outcome;
7. prove a denied follow-up is visible without rewriting the already-applied parent result;
8. keep Operation invocation and ordinary Graph Command intents representable even if execution
   waits for a later slice.

This experiment does not add HTTP, queues, an outbox, durable retries, code generation, React, or
application-specific hooks.

## Later Slices

1. Generalize exact applied outcomes for ordinary insert, update, and delete Commands.
2. Integrate canonical Operation Invocation as an executable follow-up intent.
3. Decide how Operation results expose coordinated mutation outcomes without leaking storage
   mechanics.
4. Replace common opaque `run-effect` usage with semantic intents where behavior is portable.
5. Add runtime capabilities for synchronous and durable reaction handling.
6. Explore transactional outbox delivery with Plan 132's identity and retry contracts.
7. Project outcome chains into Explorer and agent-readable evidence.

## Todo Many-To-Many Proof

Todo tagging resolves Plan 131's binary, attribute-free many-to-many gray area. `TodoTag` currently
exists only to expose the physical join table and has no independent attributes, lifecycle, policy,
or behavior. It should therefore disappear from the semantic Entity model and remain storage
evidence for a direct `TodoItem.tags <-> Tag.todos` Relation.

The proof must establish:

1. both Relation endpoints accept semantic Selections, including explicit Ref selections;
2. `add` and `remove` apply the Cartesian edge delta for one-or-many sources and targets;
3. explicit Ref selections fail structurally when any referenced participant does not exist;
4. filtered Selections may resolve empty without being confused with a missing explicit Ref;
5. batch execution is one Relationship Command and one atomic storage boundary when the adapter
   advertises that capability;
6. the join table and its columns live in storage mapping, not as duplicated semantic fields;
7. a join with attributes or lifecycle still promotes to an ordinary Association Entity;
8. Todo `assignTags` and `removeTags` Operations disappear when they add no domain semantics beyond
   the structural Relation action;
9. client-authored Todo and Tag Selections survive the existing graph protocol and policy boundary;
10. Relationship Deltas and Applied Mutation Outcomes preserve the exact links added and removed.

### Adapter Work

The proof is incomplete until the same Relation works through:

1. the in-memory runtime;
2. PostgreSQL join-table mapping, traversal, add, and remove;
3. Supabase join-table mapping, traversal, add, and remove;
4. adapter conformance tests using the same semantic command and expected delta.

PostgreSQL and Supabase already lower direct Reference Fields. They do not yet model anonymous
many-to-many edge storage, so this is real adapter work rather than documentation-only migration.

### Documentation Work

After Core and adapter conformance are green:

1. update Ontahi development documentation and the Relation Atlas concept;
2. update the Todo example README and remove language presenting `TodoTag` as a semantic Entity;
3. update the Ontahi developer book in BookOps with Relation topology, Selection-valued structural
   actions, Applied Outcomes, Reactions, and the Association Entity boundary;
4. add a migration note for legacy scalar FK plus `relation.belongsTo(..., { via })` declarations.

## Non-Goals

1. Do not make arbitrary Entity or Relation lifecycle callbacks part of the model.
2. Do not move aggregate invariants into eventually consistent reactions.
3. Do not claim that a post-application failure rolled back the primary mutation.
4. Do not make every storage row change a public Domain Event.
5. Do not promise exactly-once execution of external effects.
6. Do not infer that Association Entities and direct Relations share mutation lifecycle.

## Acceptance Checklist

- [x] Relationship execution returns a serializable Applied Mutation Outcome.
- [x] Reactions consume outcomes rather than raw hooks or opaque callbacks.
- [x] Follow-up Commands pass through the same policy and validation boundary as direct Commands.
- [x] Parent and root causal identity survive a multi-step local chain.
- [x] Cycles or excessive reaction depth terminate with observable evidence.
- [x] A failed follow-up does not falsely report that its parent mutation was unapplied.
- [x] Durable delivery returns acceptance evidence without claiming follow-up execution.
- [x] Missing or failed durable acceptance remains distinct from parent mutation status.
- [x] Reactions can invoke Operations and emit Events without opaque executable effects.
- [x] Durable envelopes reject non-JSON-safe intent instead of silently losing values.
- [x] Exact Entity create, update, and delete produce Applied Mutation Outcomes and can chain.
- [x] Association Entity creation uses the generic Entity lifecycle without application boilerplate.
- [ ] Binary attribute-free Todo tagging is a direct many-to-many Relation, not a public Entity.
- [x] Relationship actions accept Selection-valued source and target endpoints in Core.
- [ ] In-memory, PostgreSQL, and Supabase pass many-to-many Relation conformance.
- [ ] Todo no longer wraps structural tag add/remove behavior in Domain Operations.
- [ ] Ontahi developer docs and the BookOps developer book teach the expanded Relation concept.
- [ ] Required coordination and post-application reaction are documented and tested separately.
- [ ] `run-effect` is documented as a non-portable compatibility escape hatch.
- [ ] Plan 132 remains the owner of durable identity, retry, and idempotency semantics.

## Open Questions

1. Should an Operation expose one aggregate outcome, the Commands it coordinated, or both?
2. Which authority facts may be delegated to a follow-up Operation?
3. Is `emit-event` a Reaction intent, an independent projection of an outcome, or both?
4. Should synchronous required reactions exist, or should “required” mean durably accepted?
5. How are confidential mutation inputs redacted while retaining causal evidence?
