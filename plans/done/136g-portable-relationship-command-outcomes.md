# 136g. Portable Relationship Command Outcomes

Status: done

Canonical ID: `ontahi://plans/136g-portable-relationship-command-outcomes`

Parent plan: [136. Relation Constraints And Eligibility](./136-relation-constraints-and-eligibility.md)

Advances: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
and [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

## Summary

Preserve conditional-transition conflicts and Relation constraint rejections across direct and
remote Relationship Command execution. Add an explicit `onMismatch: 'skip'` conditional assignment
mode whose `not-applied` result remains distinguishable from an applied idempotent empty delta.

## Primary Risk

The current remote dispatcher maps every provider failure to `execution_unavailable`, erasing the
stable precondition or constraint evidence needed by application code, Explorer, agents, and
headless UI. Treating a skipped precondition as an empty delta would also make a stale transition
indistinguishable from a command that was validly applied but changed no facts.

## Scope

1. Define a portable direct Relationship Command result with explicit `applied` and `not-applied`
   variants.
2. Keep conditional mismatch as failure by default; allow `onMismatch: 'skip'` only when an
   `ifCurrent` precondition is present.
3. Preserve a versioned, JSON-safe diagnostic for precondition and constraint rejection through
   the graph dispatcher, Express/Fetch boundary, and remote runtime.
4. Implement identical conditional result semantics in memory, PostgreSQL, and Supabase.
5. Ensure application-bound commands create Applied Mutation Outcomes and run Reactions only for
   the `applied` variant.

## Non-Goals

1. No generic remote Entity Commands or Relation-specific Domain Operations.
2. No automatic retry, advisory eligibility preflight, aggregate constraint, or authorization
   reflection.
3. No client/React authoring facade or Explorer mutation UI; those consume this contract later.
4. No arbitrary Relation callbacks and no change to many-to-many exact-delta semantics.

## Acceptance Checklist

- [x] Default conditional mismatch remains a typed failure locally and remotely.
- [x] `onMismatch: 'skip'` returns an observable `not-applied` result without changing graph state.
- [x] Applied idempotence remains `applied` with an empty exact delta.
- [x] Constraint rejection retains its declared version, code, safe message, and parameters remotely.
- [x] PostgreSQL, Supabase, and in-memory direct Relationship Commands agree on result semantics.
- [x] Skipped application-bound commands produce no Applied Mutation Outcome or Reaction.
- [x] Focused tests, affected package suites, typecheck, lint, format, and artifact checks pass.
- [x] Public changes include a Changeset and Plan/Atlas updates.

## Split Point

Stop once direct Relationship Command outcomes and rejections are portable through existing
execution paths. Generated-client/React command ergonomics, cache reconciliation, Classroom, and
Explorer mutation affordances remain separate slices.

## Closure

Relationship Command execution now returns a portable discriminated result in memory, PostgreSQL,
Supabase, and the remote bridge. Applied commands expose their exact delta; conditional assignments
may explicitly choose `onMismatch: 'skip'` and receive a safe `not-applied` diagnostic. The default
mismatch and Relation constraint rejection remain failures, but their canonical diagnostics survive
dispatcher, Express, Fetch, and remote runtime boundaries without exposing provider causes.

Application-bound execution creates Applied Mutation Outcomes and schedules Reactions only for the
applied variant. A skipped root or Reaction follow-up stays observable without inventing mutation
evidence. Verification covered Core, React, Express, Todo, complete PostgreSQL and Supabase suites,
workspace typecheck/lint/format, package builds, and clean-room artifact installation.
