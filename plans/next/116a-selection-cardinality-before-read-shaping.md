# 116a. Selection Cardinality Before Read Shaping

Status: next

Canonical ID: `ontahi://plans/116a-selection-cardinality-before-read-shaping`

Related research: [150a. Selection Factories, Locators, And Refs](../done/150a-selection-factories-locators-and-refs.md)

## Finding

The 150a characterization test reproduces two matching rows with consumer cardinality `one`:
an unbounded in-memory read fails, but the same Query with `limit(1)` succeeds. `selectRows` slices
before `executePlainRead` checks cardinality. That is a shaped-result check, not a uniqueness check
over the original authorized membership.

[`selection-factory-research.test.ts`](../../packages/core/src/data-graph/selection-factory-research.test.ts)
records the current behavior; it is not a desired regression assertion to preserve forever.
Static inspection suggests analogous ordering in PostgreSQL `readSpec` and Supabase row hydration,
but those provider behaviors have not been experimentally reproduced in this investigation.

## Scope

Clarify whether a consumer `one` contract must validate membership before read shaping, then align
the supported adapters and portable boundary. Distinguish exact-one from intentional nullable
`first` and `exists`. Do not infer uniqueness from one returned row or weaken mutation cardinality.

The Console currently rejects explicit limits with `one()`; preserve that restriction. Investigate
implicit/policy limits too, rather than declaring the Console immune from the adapter finding.

## Acceptance

- [ ] Confirm and document the exact-one membership contract versus first-result intent.
- [ ] Add failing desired-behavior regressions at the affected runtime boundaries, including zero,
      one, two, explicit/implicit limits, ordering, count, and policy-scoped membership.
- [ ] Preserve atomic mutation behavior and avoid read-then-write changes.
- [ ] Validate PostgreSQL and Supabase independently; report unavailable live-provider coverage.
- [ ] Replace the 150a current-behavior assertion when the intended behavior is implemented, and
      keep the research record as historical evidence.

This follow-up was recorded, not implemented, by 150a.
