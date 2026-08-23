# 131b. Conditional To-One Transition

Status: done

Source plan: [131. Ontahi Relationship Semantics](../done/131-ontahi-relationship-semantics.md)

Canonical ID: `ontahi://plans/131b-conditional-to-one-transition`

## Summary

Preserve the expected current target when assigning a new target to a direct to-one Relation. This
turns reassignment into one semantic compare-and-set transition rather than an application-level
read followed by an unconditional write.

```ts
student.course.assign(nextCourse, { ifCurrent: currentCourse });
```

## Scope

1. Add typed `ifCurrent` authoring to forward `belongsTo.assign`.
2. Normalize it into JSON-safe canonical Relationship Command metadata.
3. Preserve and validate the precondition through the v1 graph-command protocol.
4. Enforce it inside the in-memory mutation boundary before constraints or writes.
5. Return a stable conflict reason and leave the dataset unchanged on mismatch.
6. Document its place in the Relation lifecycle and distinguish it from composed transactions and
   post-application Reactions.

## Non-Goals

1. No generic `transaction(async tx => ...)` API or multi-command rollback contract.
2. No Relation callbacks, Reaction registration, or arbitrary effects.
3. No provider-backed compare-and-set compilation in this child slice.
4. No conditional clear or inverse authoring expansion until evidence requires it.

## Acceptance Checklist

- [x] Bound and primitive authoring expose typed `assign(target, { ifCurrent })`.
- [x] The command and wire protocol retain portable expected-current identity.
- [x] Matching current target produces the exact replacement delta.
- [x] A stale current target fails observably without mutation.
- [x] Existing unconditional assign and inverse remove semantics remain compatible.
- [x] Focused tests, Core tests, typecheck, lint, format, and package build pass.
- [x] Public change has a Changeset and durable Relation Atlas knowledge is updated.

## Open Follow-Ups

1. Compile the same atomic precondition in PostgreSQL and Supabase under Plan 136.
2. Give Reactions ergonomic matcher/intent factories and an application-runtime registry under
   Plan 135; they remain post-application behavior, not Relation-owned callbacks.
3. Design an explicit compositional transaction capability before claiming that Operations which
   sequence Effects share rollback.

## Closure

Core now authors, transports, validates, and enforces conditional to-one reassignment in memory.
The proof establishes the portable command contract and observable stale-target conflict while
leaving provider atomic compilation as the next concurrency-sensitive slice.
