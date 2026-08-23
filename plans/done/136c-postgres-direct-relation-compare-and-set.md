# 136c. PostgreSQL Direct Relation Compare-And-Set

Status: done

Source plans: [136. Relation Constraints And Eligibility](136-relation-constraints-and-eligibility.md), [131b. Conditional To-One Transition](../done/131b-conditional-to-one-transition.md)

Canonical ID: `ontahi://plans/136c-postgres-direct-relation-compare-and-set`

## Summary

Execute direct `belongsTo/hasMany` Relationship Commands through PostgreSQL and preserve a to-one
`ifCurrent` precondition inside the same SQL statement that replaces the edge.

## Scope

1. Compile canonical direct Relationship Commands against Entity mappings.
2. Resolve source and target Refs exactly once inside one guarded statement.
3. Materialize the exact added/removed Relationship Delta.
4. Reject stale conditional assignment without changing the edge.
5. Route the focused Relationship Command runtime capability from PostgreSQL storage.
6. Refuse Relations carrying eligibility constraints until their SQL compilation is implemented;
   never silently bypass them.

## Non-Goals

1. No Supabase RPC in this slice; extract it as 136d from the proven PostgreSQL contract.
2. No aggregate eligibility constraints, retries, or multi-command transaction API.
3. No Reactions or lifecycle callbacks.

## Acceptance Checklist

- [x] SQL compilation is parameterized and mapping-aware.
- [x] Unconditional assign, conditional reassignment, clear, and guarded inverse remove preserve Core semantics.
- [x] Missing source/target and stale current target remain distinct observable failures.
- [x] One PostgreSQL integration proof verifies the write and exact delta.
- [x] Constrained direct Relations fail closed.
- [x] Focused tests, package tests, typecheck, lint, build, format, and artifact checks pass.
- [x] Public adapter change has a Changeset and Atlas/Plan 136 are updated.

## Follow-Ups

1. 136d: expose the same direct Relation contract through one invoker-rights Supabase RPC.
2. Compile portable participant eligibility into the guarded provider mutation.
3. Design aggregate constraint conflict/retry semantics independently.

## Closure

PostgreSQL now advertises the focused direct Relationship Command capability. One parameterized
statement locks and resolves the source, resolves the target, verifies expected-current identity,
applies the edge transition, and returns the state needed for the exact delta. Real PostgreSQL
integration covers unconditional assign, conditional reassignment, clear, guarded inverse remove,
and stale conflict without mutation. Constraints fail closed pending atomic predicate compilation.
