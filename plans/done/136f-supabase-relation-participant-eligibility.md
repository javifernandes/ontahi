# 136f. Supabase Relation Participant Eligibility

Status: done

Canonical ID: `ontahi://plans/136f-supabase-relation-participant-eligibility`

Parent plan: [136. Relation Constraints And Eligibility](./136-relation-constraints-and-eligibility.md)

## Summary

Carry PostgreSQL's atomic participant-eligibility contract through the invoker-rights Supabase
Relationship RPCs. Server-owned Entity definitions compile portable constraints and mappings into
the RPC payload; the database locks, evaluates, rejects, or mutates without a PostgREST preflight.

## Scope

1. Add mapped direct and many-to-many participant constraints to the existing versioned RPC
   payloads.
2. Reuse the canonical constraint resolution and compiled Selection expression rather than adding
   a Supabase-only eligibility model.
3. Lock all selected link participants and guard the mutation with their constraint results.
4. Return the first stable rejection descriptor as structured RPC data.
5. Surface rejection through the host error factory without confusing it with cardinality,
   precondition conflict, or RPC failure.
6. Prove the migration SQL against PostgreSQL and cover the adapter materialization contract.

## Non-Goals

1. No PostgREST read/write eligibility preflight.
2. No authorization or RLS replacement; the RPC remains invoker-rights.
3. No aggregate constraints, retries, generic remote Entity Commands, or transaction API.
4. No new Relation callbacks or UI mutation affordances.

## Acceptance Checklist

- [x] Direct and many-to-many payloads preserve mapped portable constraints and rejections.
- [x] The invoker-rights RPC locks and evaluates link participants in its mutation transaction.
- [x] A mixed many-to-many affected set is rejected without partial edge changes.
- [x] Structured eligibility rejection remains distinct from cardinality and precondition failure.
- [x] Unlink remains available for currently ineligible participants.
- [x] Focused tests, Supabase package tests, typecheck, lint, build, format, and artifact checks pass.
- [x] Public changes have a Changeset and Plan/Atlas knowledge records provider parity.

## Closure

Server-owned direct and many-to-many definitions now compile mapped participant predicates and
stable rejection descriptors into version 2 RPC payloads. The reusable invoker-rights SQL locks
the full selected participant sets, evaluates eligibility with two-valued nullable semantics, and
returns structured rejection evidence from the same transaction that would apply the edge. An old
version 1 RPC rejects constrained version 2 payloads instead of silently ignoring them;
unconstrained and unlink commands retain version 1 compatibility.

The PostgreSQL-backed RPC integration proves direct rejection, nullable fail-closed evaluation,
mixed many-to-many rejection without partial edges, and repairing unlink. The Supabase package
closes with 51 passing tests and 82.39% line coverage. Typecheck, lint, build, format, Changeset
status, and clean-room package artifact verification pass. Projects adopting this slice must apply
the updated exported RPC migration SQL before sending constrained commands.
