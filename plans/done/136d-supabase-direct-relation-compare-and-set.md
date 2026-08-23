# 136d. Supabase Direct Relation Compare-And-Set

Status: done

Source plan: [136. Relation Constraints And Eligibility](../current/136-relation-constraints-and-eligibility.md)

Canonical ID: `ontahi://plans/136d-supabase-direct-relation-compare-and-set`

## Summary

Expose the direct Relationship Command and conditional to-one transition contract through one
invoker-rights Supabase RPC, preserving PostgreSQL 136c semantics without a read/write PostgREST
race.

## Acceptance Checklist

- [x] Ship reusable migration SQL and configurable RPC name.
- [x] Resolve endpoints and apply the guarded edge change in one database transaction.
- [x] Preserve exact deltas, stale-precondition failure, and guarded inverse remove.
- [x] Respect grants/RLS through invoker rights and fail when RPC capability is absent.
- [x] Fail closed for constraints until the RPC compiles them atomically.
- [x] Add adapter tests, README guidance, Changeset, and Atlas evidence.

## Closure

Supabase now advertises the focused direct Relationship Command capability when configured with the
participating Entities and an RPC-capable command client. The JSON-safe payload contains compiled
endpoint Selections and mapped storage identity; one invoker-rights function locks, guards and
applies the transition. Runtime tests prove exact replacement, stale conflict, guarded inverse
no-op, capability absence and structural failure behavior. Eligibility SQL compilation remains in
the parent Plan 136. A Testcontainers integration installs the exported migration in PostgreSQL 17,
applies a conditional transition, simulates a concurrent reassignment, and proves a stale caller
cannot overwrite it.
