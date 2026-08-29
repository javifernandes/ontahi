# 136h. Authority-Serialized Relation Count Constraints

Status: done

Canonical ID: `ontahi://plans/136h-authority-serialized-relation-count-constraints`

Parent: [136. Relation Constraints And Eligibility Semantics](../current/136-relation-constraints-and-eligibility.md)

Advances: [142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md)

Predecessor: [142f. Virtual Derived Fields And Classroom Capacity](./142f-virtual-derived-fields-and-classroom-capacity.md)

## Summary

Add the first current-population Relation constraint: a to-many Relation count bounded by a stored
Field on its declaring endpoint. Enforce prospective additions through the canonical direct
Relationship Command in memory and PostgreSQL, regardless of whether application code authors the
mutation from the forward `belongsTo` or inverse `hasMany` endpoint.

Classroom uses the constraint to prevent `Course.students` from exceeding `Course.capacity`. The
same Relation count remains the source for the virtual `occupiedSeats` and `availableSeats` Fields.

## Risk To Prove

A read followed by a write, or even a single statement that waits for a lock after taking its
snapshot, does not prove an aggregate upper bound under PostgreSQL `READ COMMITTED`. Two Students
can otherwise observe the same last available seat and update different source rows successfully.

The provider proof must serialize contenders on the destination Course, then evaluate the
prospective count from a fresh statement snapshot before applying the canonical edge mutation.
The in-memory implementation must use the same declared rejection and prospective-state meaning.

## Vertical Slice

1. Add a JSON-safe `relationConstraint.countAtMost(field, rejection)` contract with explicit
   `authority-serialized` enforcement metadata.
2. Resolve a constraint declared on an inverse `hasMany` Relation onto the canonical direct
   Relationship Command without duplicating it across forward/inverse authoring.
3. Reject a prospective addition when `current count + 1` exceeds the declaring endpoint Field;
   treat an idempotent link as an empty delta rather than revalidation.
4. Preserve repair-safe behavior: removal from already-invalid data remains allowed.
5. In PostgreSQL, automatically open a transaction for constrained top-level Relationship
   Commands, lock the destination endpoint, and evaluate/apply in a subsequent statement.
6. Prove with two concurrent last-seat admissions that exactly one commits and the other receives
   the stable Relation rejection.
7. Declare the Classroom constraint and remove the Operation-local capacity guard.
8. Reflect the static constraint separately from authority-dependent runtime affordances.

## Semantic Boundary

This slice is a structural Relation invariant: it governs changes to Relation membership made
through canonical Relationship Commands. It is not yet the complete permanent Entity invariant
shown in Plan 142. In particular, lowering `Course.capacity` through a generic Graph Command, or
bypassing Ontahí with a raw storage write, is outside this slice. Publishing `Entity.invariants`
requires routing every relevant mutation path through one invariant planner and remains open.

`authority-serialized` means contenders for the same constrained endpoint are ordered by the
authoritative runtime before prospective evaluation. It does not claim global serializable
isolation, automatic retry, or offline merge safety.

## Non-Goals

1. No generic permanent `Entity.invariants` API or interception of arbitrary Graph Commands.
2. No Supabase RPC change, distributed transaction, retry policy, escrow, or merge-safe counter.
3. No derived-Field materialization or client-cache aggregate inference.
4. No generic remote Entity Commands or Explorer mutation UI.
5. No arbitrary callbacks on Relation metadata.
6. No many-to-many aggregate enforcement in this first slice.

## Acceptance Checklist

- [x] Core owns a portable, validated count constraint and canonical resolver.
- [x] Reflection exposes the constraint, enforcement requirement, and stable rejection.
- [x] In-memory forward and inverse additions agree on rejection and unchanged state.
- [x] In-memory removals repair already-invalid state and empty deltas do not revalidate.
- [x] PostgreSQL uses a real transaction plus endpoint serialization and a fresh evaluation
      statement, not a race-prone preflight or stale single-statement snapshot.
- [x] Concurrent last-seat admissions produce exactly one commit and one stable rejection.
- [x] Classroom declares capacity once on `Course.students`; `Student.transfer` has no manual
      capacity check.
- [x] Focused tests, typecheck, lint, generated artifacts, Changeset, Plan, Atlas, and developer
      documentation are complete.

## Delivery Evidence

1. Core exposes `relationConstraint.countAtMost(...)`, validates its stored numeric limit, reflects
   its authority requirement, resolves inverse declarations to the canonical direct target, and
   enforces prospective additions in memory.
2. PostgreSQL keeps participant eligibility and aggregate compilation separate. A constrained
   command starts or reuses an explicit `READ COMMITTED` transaction, locks the destination, and
   evaluates the count in a subsequent statement.
3. The provider integration launches two concurrent additions against capacity one and proves one
   applied delta, one `course_full` rejection, and one persisted Student membership.
4. Supabase rejects the unsupported authority-serialized requirement before invoking its RPC;
   repair-safe unlink remains available.
5. Classroom owns the constraint on `Course.students`, removes its Operation-local capacity read,
   and proves the same rejection through `Student.transfer` on PostgreSQL.
