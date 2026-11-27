# 174. Incremental Entity Publication

Status: next

## Summary

Provide a provider-neutral way to publish changed rows of a materialized Entity projection.
A host supplies a candidate, an identity and equality contract, and the scopes in which an
omission represents removal. Ontahí computes the writes against accepted current rows and can
apply them in the active Entity store as part of the existing publication transaction.

## Consumer Evidence

Atlas derives complete publication candidates even when it can avoid rewriting unchanged rows.
The consumer intervention is owned by `atlas://plans/156-adaptive-materialization-policy`.
The three cases below inform the contract.

| Atlas case                 | What the contract must express                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AtlasSourceRecord`        | Identity stays stable across input revisions. Equality includes persisted provenance and a content digest, so a provenance-only change still writes a row.                                                |
| `AtlasPlanRelationBinding` | Remove obsolete relations before deleting their targets. Write new or changed relations after the referenced rows exist.                                                                                  |
| `EvidenceBinding`          | A complete successful source observation authorizes removal by absence within its scope. A failed source preserves its prior rows. An explicit webhook observation can still contribute a positive write. |

[Atlas #131](https://github.com/javifernandes/atlas/pull/131) delivered Source Record publication.
[Atlas #132](https://github.com/javifernandes/atlas/pull/132) proposes the two binding cases and
verifies their output against rebuild. Local measurements justify examining the abstraction.
Measure provider reads, payload, and writes before assuming that each host benefits.

This plan builds on [Plan 172](../current/172-replicated-collection-observer-and-acceptance-runner.md).
An accepted collection snapshot can feed a Materializer. Entity publication applies the derived
candidate to the current graph. These stages can advance independently and have separate authority
and concurrency boundaries.

## Proposed Form

Start with a small, deterministic diff over candidate rows and current rows. Use stable row
identity and compare the fields that affect persisted meaning. Reject ambiguous identities before
producing mutations. Return puts, removes, and counts for reused rows. Prefer a minimal read
projection when equality only requires metadata or digests.

The application supplies completeness by scope. A positive row is eligible for a put even when
its scope has no complete observation. An omission can remove a current row only when the scope
observation is complete and its coverage is ordered after the last accepted positive event for
that row. If the event is newer or ordering cannot be established, retain the row or reject the
candidate. A source watermark, an observation base revision, or a check against accepted event
positions at publication can establish coverage without relying on wall-clock order. Explicit
provider deletions should be evaluated against the accepted-collection contract before adding a
second deletion mechanism here.

For example, with accepted rows `A/keep`, `A/old`, and `B/keep`, a complete observation of A
can supply `A/keep` and `A/new`. If B failed and a trusted event separately supplies `B/new`,
publication keeps `A/keep` and `B/keep`, removes `A/old`, and puts `A/new` and `B/new`.

Apply the diff in the existing Unit of Work against the same state used for comparison. Use the
host's existing publication lock or a storage-owned revision guard. A stale candidate cannot
overwrite a newer publication. Check observation coverage against the accepted rows used for the
diff. The revision guard protects the interval from comparison to commit, while the coverage
check also accounts for events accepted between capture and comparison. Maintain explicit
dependency order for the first implementation.
Apply child removals before parent removals and parent puts before dependent puts. Publish the
accepted revision only after the complete write batch succeeds.

## Execution Slices

1. [ ] Characterize the three Atlas fixtures and agree on identity, equality, and completeness.
2. [ ] Prove the deterministic diff in Core with in-memory fixtures for row and scope semantics.
3. [ ] Apply the diff using the active Entity store in one Unit of Work. Prove rollback, stale
       publication rejection, and dependency ordering in PostgreSQL.
4. [ ] Replace one Atlas publication seam with the shared mechanism and compare it to rebuild.
       Adopt the other two cases where the contract fits without duplicating provider logic.
5. [ ] Record the resulting API, observed costs, and any deferred cases in the relevant durable
       Ontahí item.

## Acceptance Checklist

- [ ] Equal rows emit no mutation. Additions, changed persisted fields, and valid omissions
      produce the expected puts and removes. Replay is idempotent.
- [ ] An incomplete or failed scope cannot authorize a delete by omission. A successful empty
      scope can when its coverage follows the last accepted positive event for that row. A
      positive observation has independent authority to put.
- [ ] A complete observation captured before a later accepted positive event cannot remove
      that event's row, even when the diff runs after the event is accepted.
- [ ] Results preserve foreign-key ordering and match a full rebuild for the three consumer cases.
- [ ] A rollback or stale writer leaves the previously accepted publication visible.
- [ ] The default path uses the active Entity store and transaction.
- [ ] Report compared, written, removed, and reused counts and capture comparison, mutation, and
      total publication time separately.

## Verification

Run focused replication and Entity storage tests plus the PostgreSQL integration suite. Exercise
bootstrap, no-op, provenance-only changes, mixed additions and removals, failed scope plus
positive overlay, recovery to an empty scope, conflicting writers, and failure mid-batch.
Capture a complete observation that omits a row, accept a positive event for that row, then
compare and try to publish the earlier observation. Assert that the row survives. Repeat with
a complete empty observation whose coverage follows the event and verify that removal is allowed.
In Atlas, compare persisted rows and snapshot content with rebuild. Separate SQL writes avoided
from any gain in end-to-end publication time.

## Scope Boundaries and Open Questions

Keep GitHub observation, Evidence Binding rules, target identity, and snapshot publication policy
in Atlas. Keep automatic dependency inference, delta snapshots, and generic Materializer checkpoint
persistence outside the first cut. Verify whether the existing Data Graph mutation and Unit of Work
contracts suffice before adding an adapter surface. Evaluate read-and-diff against provider-side
conditional writes using measured workload data.

## Closure / Evolution

Close after all three semantics are proven and at least one real Atlas seam uses the shared
contract. Record any remaining Atlas adoption and additional provider work as explicit follow-ups.
