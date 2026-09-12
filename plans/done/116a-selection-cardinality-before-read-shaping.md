# 116a. Selection Cardinality Before Read Shaping

Status: done

Canonical ID: `ontahi://plans/116a-selection-cardinality-before-read-shaping`

Related research: [150a. Selection Factories, Locators, And Refs](../done/150a-selection-factories-locators-and-refs.md)

## Original finding (150a)

The 150a characterization test reproduces two matching rows with consumer cardinality `one`:
an unbounded in-memory read fails, but the same Query with `limit(1)` succeeds. `selectRows` slices
before `executePlainRead` checks cardinality. That is a shaped-result check, not a uniqueness check
over the original authorized membership.

[`selection-factory-research.test.ts`](../../packages/core/src/data-graph/selection-factory-research.test.ts)
originally recorded the behavior; 116a replaces it with a desired regression assertion.
Static inspection suggests analogous ordering in PostgreSQL `readSpec` and Supabase row hydration,
but those provider behaviors have not been experimentally reproduced in this investigation.

## Scope

Clarify whether a consumer `one` contract must validate membership before read shaping, then align
the supported adapters and portable boundary. Distinguish exact-one from intentional nullable
`first` and `exists`. Do not infer uniqueness from one returned row or weaken mutation cardinality.

The Console currently rejects explicit limits with `one()`; preserve that restriction. Investigate
implicit/policy limits too, rather than declaring the Console immune from the adapter finding.

## Acceptance

- [x] Confirm and document the exact-one membership contract versus first-result intent.
- [x] Add failing desired-behavior regressions at the affected runtime boundaries, including zero,
      one, two, explicit/implicit limits, ordering, count, and policy-scoped membership.
- [x] Preserve atomic mutation behavior and avoid read-then-write changes.
- [x] Validate PostgreSQL and Supabase independently; report unavailable live-provider coverage.
- [x] Replace the 150a current-behavior assertion when the intended behavior is implemented, and
      keep the research record as historical evidence.

This follow-up was recorded, not implemented, by 150a.

## Implementation decisions

- `one` constrains authorized membership before read shaping, not the number of returned rows.
- Positive limits cannot hide a second match. `one` with `limit(0)` is rejected explicitly,
  including count reads, rather than returning data against the caller's zero-row request.
- Keep nullable first-result and existence reads distinct from exact-one.
- The SQL implementation is shared by PostgreSQL and MySQL. Supabase must also account for
  server-side row caps; a single returned row alone is not evidence of uniqueness.

## Implementation and evidence

- In-memory validates complete authorized membership before slicing/materializing, including
  legacy related-root reads and deferred relation-image targets.
- Shared SQL probes at most two rows in the same statement for exact-one reads, before includes.
  Count reads now enforce cardinality too. PostgreSQL and MySQL reuse this implementation.
- Supabase requests exact count metadata with root rows and validates before loading includes.
  Missing metadata fails closed; count/data disagreement cannot produce a successful exact-one
  read. This adds exact-count cost on Supabase, not a second count/read round trip.
- Portable v1/v2 read parsing rejects exact-one zero limits. The dispatcher also recognizes typed
  cardinality failures wrapped by `Effect.runPromise`, preserving the structured diagnostic.
- No Command execution or mutation algorithm changed; existing atomic rejection tests still pass.

Initial desired regressions failed in the 150a in-memory test, SQL count handling, and Supabase's
capped-row response. Final checks on Node 24:

- Core full suite: 1,020 tests (615 data-graph); shared SQL: 29 tests; Supabase non-integration: 68 tests.
- Language: 326 tests, including the existing Console one/first/exists and limit restrictions.
- PostgreSQL: 53 live integration tests, including contextual cardinality in one SQL statement.
- MySQL: 46 live integration tests (including the in-memory baseline).
- Supabase relationship RPC: 3 tests against local PostgreSQL; this verifies mutation regression,
  **not** live PostgREST read behavior.
- Core, SQL, Supabase builds; Core/SQL/Supabase/PostgreSQL/MySQL typechecks; affected runtime lint.
- `pnpm verify:artifacts -- --skip-build`: clean-room tarball installation, typechecking, and
  existing runtime/consumer proofs passed after rebuilding the changed packages.

Supabase read evidence is an independent adapter-level test double representing PostgREST's
count/data response, including a server-capped row with count two, missing counts, and mismatched
data/count. No hosted Supabase or live PostgREST read endpoint was exercised in this slice.

## Closure

116a closes the cardinality/read-shaping gate. Variants remain in
[152](../next/152-discriminated-entity-variants.md); Console Commands and Operations remain in
[150](../current/150-ontahi-devtools-semantic-console.md). This does not widen mutable Selection
targeting, remove locators, or guarantee that membership stays unchanged after a read.
