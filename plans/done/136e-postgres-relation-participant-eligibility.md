# 136e. PostgreSQL Relation Participant Eligibility

Status: done

Canonical ID: `ontahi://plans/136e-postgres-relation-participant-eligibility`

Parent plan: [136. Relation Constraints And Eligibility](../current/136-relation-constraints-and-eligibility.md)

## Summary

Compile the portable source/target participant Selection constraints proven by Plans 136a and
136b into PostgreSQL Relationship Commands. Resolve constraint direction once against the
canonical Relation, lock the selected participants, evaluate every constraint, and apply the edge
mutation in the same statement.

## Primary Risk

A provider preflight can approve a participant whose eligibility changes before the edge write.
Filtering ineligible participants out of an endpoint Selection would also fail open by mutating a
subset instead of returning the declared rejection. The proof must therefore preserve the complete
affected set and guard its mutation with constraint evidence obtained under the same database
boundary.

## Scope

1. Resolve constraints declared on either direct Relation endpoint into canonical command
   participants without provider-specific direction logic.
2. Compile the existing portable Selection predicate vocabulary against PostgreSQL mappings.
3. Lock direct and many-to-many participants before evaluating link eligibility.
4. Reject the complete command with the first stable declared rejection descriptor.
5. Preserve direct exact deltas, conditional assignment conflicts, explicit Ref cardinality, empty
   filtered many-to-many selections, and unconstrained unlink behavior.
6. Prove the guarded statement with focused compiler tests and a real PostgreSQL integration.

## Non-Goals

1. No aggregate, population-count, uniqueness, time, authority, or external-service constraints.
2. No advisory preflight, automatic retry, or generic compositional transaction API.
3. No provider-specific constraint syntax in Core or Relation metadata.
4. No Supabase RPC change; Plan 136f applies the proven contract there.

## Acceptance Checklist

- [x] One Core resolution contract maps forward and inverse declarations to canonical participants.
- [x] Direct PostgreSQL link evaluates every applicable constraint atomically with mutation.
- [x] Many-to-many PostgreSQL link rejects a mixed eligible/ineligible affected set as a whole.
- [x] Rejection exposes the declared version, code, safe message, and parameters.
- [x] Conditional conflicts and endpoint cardinality retain precedence over eligibility rejection.
- [x] Unlink bypasses link eligibility and existing unconstrained behavior remains compatible.
- [x] Focused tests, PostgreSQL package tests, typecheck, lint, build, format, and artifact checks pass.
- [x] Public changes have a Changeset and Plan/Atlas knowledge records the durable boundary.

## Closure

Core now resolves constraints declared on either direct endpoint into canonical command-relative
source and target participants. PostgreSQL compiles the portable predicate vocabulary with
two-valued nullable semantics, locks the complete participant set, preserves the first declared
rejection, and guards direct and many-to-many link mutation in the same statement. Endpoint
cardinality and a genuinely stale `ifCurrent` remain higher-precedence outcomes; a matching
precondition no longer masks an eligibility rejection. Unlink omits eligibility so invalid legacy
facts remain repairable.

A real PostgreSQL 17 integration proves direct rejection without mutation, nullable fail-closed
evaluation, conditional transition precedence, mixed many-to-many all-or-nothing behavior, and
repairing unlink. The package closes with 61 passing tests and 92.19% line coverage; Core has 553
passing tests. Typecheck, lint, build, format, Changeset status, and clean-room package artifact
verification pass.
