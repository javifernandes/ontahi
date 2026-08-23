# 136d. Supabase Direct Relation Compare-And-Set

Status: next

Source plan: [136. Relation Constraints And Eligibility](../current/136-relation-constraints-and-eligibility.md)

Canonical ID: `ontahi://plans/136d-supabase-direct-relation-compare-and-set`

## Summary

Expose the direct Relationship Command and conditional to-one transition contract through one
invoker-rights Supabase RPC, preserving PostgreSQL 136c semantics without a read/write PostgREST
race.

## Acceptance Checklist

- [ ] Ship reusable migration SQL and configurable RPC name.
- [ ] Resolve endpoints and apply the guarded edge change in one database transaction.
- [ ] Preserve exact deltas, stale-precondition failure, and guarded inverse remove.
- [ ] Respect grants/RLS through invoker rights and fail when RPC capability is absent.
- [ ] Fail closed for constraints until the RPC compiles them atomically.
- [ ] Add adapter tests, README guidance, Changeset, and Atlas evidence.
