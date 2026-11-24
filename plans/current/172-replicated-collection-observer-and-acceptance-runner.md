# 172. Replicated Collection Observer And Acceptance Runner

Status: current

## Summary

Define a provider-neutral `ReplicatedCollectionObserver` contract and a small acceptance runner for
collections maintained from an external or independently versioned source. The observer discovers
positive and negative record changes relative to an accepted frontier; the runner validates and
atomically accepts a complete resulting snapshot that downstream Materializers can consume.

The first implementation should be a small kernel over Ontahi's existing replicated-versioned-model
primitives. Atlas can then replace the ad hoc orchestration proven by
`atlas://plans/163-incremental-github-evidence-replication` and
[Atlas PR #117](https://github.com/javifernandes/atlas/pull/117) incrementally, while retaining
ownership of every GitHub-specific observation rule.

## Context

Atlas proved a second replicated Source shape beyond Git-backed files: an ordered provider
collection observed through an accepted `updated_at` frontier, with normalized relevant records,
inclusive boundary overlap, idempotent additions and removals, and a complete accepted replica.
The implementation also showed that collection observation and acceptance are reusable concerns,
while pagination, provider timestamps, payload normalization, and Evidence Binding derivation are
not.

Ontahi already owns the generic Replicated Versioned Model kernel and Materializer SPI in
[Plan 169](../current/169-replicated-versioned-models-kernel-and-materializer-spi.md). What is
missing is the preceding collection-observation boundary: a host should be able to discover a
candidate change set, validate or repair it, and accept one complete collection snapshot without
rebuilding provider-specific orchestration around each Materializer.

## Research / Evidence

- `atlas://plans/163-incremental-github-evidence-replication` establishes bootstrap, incremental
  reuse, full repair, inclusive frontier handling, and positive and negative observations.
- [Atlas PR #117](https://github.com/javifernandes/atlas/pull/117) proves persisted normalized
  records, an accepted per-source frontier, idempotent application, and separate `fetched`,
  `changed`, `reused`, and `resulting` counts.
- `ontahi://plans/169-replicated-versioned-models-kernel-and-materializer-spi` establishes atomic
  frontier acceptance, replay behavior, stale/conflicting frontier rejection, accepted snapshots,
  and the Materializer boundary this plan should feed.
- The Atlas evidence is consumer proof, not a framework specification. GitHub pagination,
  `updated_at` semantics, normalized Pull Request payloads, and Evidence Binding derivation remain
  Atlas-owned.

## Scope

- Define `ReplicatedCollectionObserver<Record, Frontier, Diagnostic>` with an observation operation
  shaped as `observe(acceptedFrontier, mode) -> changes + targetFrontier + diagnostics`.
- Support `bootstrap`, `incremental`, `validation`, and `repair` modes with explicit completeness
  and acceptance rules.
- Represent positive and negative record changes with stable record identities and idempotent
  application semantics.
- Add a small runner that composes observation, accepted-snapshot loading, change application,
  validation, and atomic acceptance.
- Reject stale writers and frontier conflicts without mutating the last accepted snapshot.
- Report `fetched`, `changed`, `reused`, and `resulting` metrics consistently across modes.
- Expose the accepted collection snapshot as input consumable by Materializers.
- Persist collection replica state through the application's active Entity storage by default.
- Permit a custom storage adapter only as an explicit escape hatch.
- Prove the contract with a provider-neutral in-memory observer and one Atlas adoption path.

## Non-Goals

- Owning GitHub pagination, `updated_at` ordering or tie behavior, normalized Pull Request payloads,
  or Evidence Binding derivation in Ontahi.
- Moving Atlas product behavior, migration history, or reconciliation policy into this repository.
- Standardizing provider cursors or assuming every frontier is a timestamp.
- Making provider records queryable domain Entities merely because they are persisted.
- Replacing the Replicated Versioned Model kernel or Materializer SPI.
- Requiring distributed transactions across provider observation and local acceptance.

## Proposed Form

### Observer contract

```ts
type CollectionObservationMode = 'bootstrap' | 'incremental' | 'validation' | 'repair';

type CollectionChange<Id, Record> =
  | { kind: 'put'; id: Id; record: Record }
  | { kind: 'remove'; id: Id };

type CollectionObservation<Id, Record, Frontier, Diagnostic> = {
  changes: readonly CollectionChange<Id, Record>[];
  targetFrontier: Frontier;
  diagnostics: readonly Diagnostic[];
  metrics: {
    fetched: number;
    changed: number;
    reused: number;
    resulting: number;
  };
  completeness: 'candidate' | 'complete';
};

interface ReplicatedCollectionObserver<Id, Record, Frontier, Diagnostic> {
  observe(
    acceptedFrontier: Frontier | null,
    mode: CollectionObservationMode,
  ): Promise<CollectionObservation<Id, Record, Frontier, Diagnostic>>;
}
```

Frontiers remain opaque, provider-owned values. The observer owns how a mode reaches its
`targetFrontier`; the runner owns whether the result is safe to accept. Diagnostics explain gaps,
validation mismatches, repair choices, provider failures, or rejected acceptance without becoming
part of collection identity.

`bootstrap` starts without an accepted frontier and must yield a complete candidate collection.
`incremental` starts from an accepted frontier and may reuse accepted records while returning only
idempotent changes. `validation` compares the accepted snapshot with an independently observed
complete view and does not silently mutate it. `repair` produces a complete replacement candidate
after a gap, mismatch, incompatible observation strategy, or operator request.

### Acceptance runner

```txt
accepted snapshot + accepted frontier
  -> observe(accepted frontier, mode)
  -> apply idempotent put/remove changes to an isolated candidate
  -> validate identities, completeness, metrics, and frontier transition
  -> compare-and-swap accepted frontier
  -> atomically publish target frontier + complete accepted snapshot
  -> provide accepted snapshot to Materializers
```

Acceptance is one storage transaction or an equivalent compare-and-swap operation. It conditions
the write on the accepted frontier read by the runner. A delayed runner that observed frontier
`F1` cannot replace a snapshot already advanced to `F2`; it receives a stale-writer diagnostic and
must observe again. Provider failure, validation failure, an incomplete bootstrap or repair, or a
frontier conflict leaves both the accepted frontier and snapshot unchanged.

Change application is idempotent: replaying the same `put` converges on the same record, replaying
the same `remove` leaves the record absent, and replaying an already accepted observation does not
double-count or corrupt the result. `changed` counts accepted logical record changes, `reused`
counts accepted records carried into the candidate without change, and `resulting` is the complete
candidate size. `fetched` is observer-reported work and may exceed `changed`.

### Persistence and record identity

Replica records are internal persisted records by default, not addressable Ontahi Entities. They
use the same active storage and transaction contract as the application's Entities so an
application does not need a second database, lifecycle, or configuration surface. Their namespace,
record identity, payload, frontier, and acceptance metadata remain distinguishable from the domain
Entity model.

This default avoids granting provider cache rows domain addressability, relations, operations, or
public query semantics. A later application may deliberately project accepted records into
Entities through a Materializer when those semantics are required.

The runner may accept a custom replica-storage adapter as an escape hatch for deployments whose
active Entity store cannot provide the required atomic compare-and-swap or for intentionally
separate storage. The adapter is not the primary setup path and must preserve the same acceptance,
snapshot, and stale-writer semantics.

### Materializer handoff

The runner returns or exposes the newly accepted immutable snapshot together with its accepted
frontier. A Materializer consumes that accepted snapshot, never a partial observation or the
runner's mutable candidate. Observation diagnostics and metrics remain available as execution
evidence without changing the Materializer's semantic input.

## Execution Slices

1. [x] Define the minimal observer, mode, change, diagnostics, metrics, and accepted-snapshot
       types alongside the existing replication kernel.
2. [x] Implement a provider-neutral in-memory runner that applies positive and negative changes,
       validates completeness, and publishes an accepted snapshot atomically.
3. [x] Prove replay, stale-writer protection, failed observation, validation
       mismatch, bootstrap, incremental, and repair behavior with deterministic tests.
4. [x] Add the persistence port and store-owned compare-and-swap revision, resolve it from the
       active Entity storage by default, and prove the contract with the in-memory storage; keep a
       custom adapter as an explicit option.
5. [x] Implement the capability in PostgreSQL without
       moving provider transaction mechanics into Core.
6. [x] Connect accepted collection snapshots to the existing Materializer runner without exposing
       unaccepted candidates.
7. [x] Update the smallest durable Ontahi Atlas item for Replicated Versioned Models with the
       accepted observer and storage decisions.
8. [ ] Replace the smallest ad hoc orchestration seam from Atlas PR #117 with the Ontahi runner,
       leaving the GitHub adapter and Evidence Binding derivation in Atlas.
9. [ ] Migrate remaining Atlas orchestration gradually only after full and incremental results,
       diagnostics, and metrics are equivalent.

## Acceptance Checklist

- [ ] `observe(acceptedFrontier, mode)` returns changes, a target frontier, diagnostics, metrics,
      and an explicit completeness claim.
- [ ] Bootstrap and repair cannot be accepted unless they produce a complete snapshot.
- [ ] Incremental positive and negative changes converge under duplicate replay.
- [ ] Validation detects divergence without mutating accepted state.
- [ ] Frontier and complete snapshot acceptance are atomic.
- [ ] A writer based on a superseded accepted frontier cannot overwrite newer state.
- [ ] Metrics distinguish fetched, changed, reused, and resulting record counts.
- [ ] Materializers can consume the immutable accepted snapshot and exact accepted frontier.
- [ ] Default persistence uses the same active storage as application Entities.
- [ ] A custom storage adapter is optional and preserves the full acceptance contract.
- [ ] Replica records remain internal persisted records unless explicitly materialized as Entities.
- [ ] Atlas retains all GitHub-specific collection semantics and domain derivation behavior.
- [ ] Atlas can migrate from PR #117 orchestration in small, behaviorally equivalent steps.

## Verification

- Unit tests cover all four modes, positive and negative replay, no-op observations, and metric
  invariants.
- Concurrency tests run two observers from the same accepted frontier and prove only one conflicting
  advance can publish.
- Failure tests prove provider, validation, persistence, and Materializer handoff failures cannot
  expose a partial accepted snapshot.
- Storage contract tests run against the default active Entity store and the custom-adapter test
  fixture.
- A reference Materializer receives only an accepted snapshot and produces the same result after
  bootstrap, incremental replay, and repair.
- Atlas characterization tests compare its current PR #117 path with the first runner-backed path,
  including removals and `fetched`/`changed`/`reused`/`resulting` counts.
- Run Ontahi's focused replication tests and `pnpm verify`; run Atlas's focused replica tests and
  `pnpm verify` for each adoption slice.

## Decisions

1. The contract is provider-neutral; frontier ordering and fetch mechanics belong to observers.
2. Observation produces an isolated candidate, while acceptance publishes frontier and snapshot
   atomically through optimistic concurrency control.
3. Accepted snapshots, not raw changes or partial observations, are the Materializer input.
4. Replica records are internal persisted records by default. They share the active Entity storage
   contract but do not become addressable Entities implicitly.
5. A custom replica store is an escape hatch, not required application infrastructure.
6. The first implementation is the small kernel and runner; Atlas adoption follows incrementally.

## Open Questions

1. Which existing storage capability should expose transaction-scoped compare-and-swap without
   leaking a specific database into `@ontahi/core`?
2. Should validation return only diagnostics or also a repair-ready complete candidate when the
   observer can obtain one at no additional provider cost?
3. Which metric fields belong to the portable result versus host telemetry attributes?

## Closure / Evolution

Current. The first implementation slice adds the provider-neutral observer contract and acceptance
runner to `@ontahi/core`. It proves all four modes, complete-snapshot guards, idempotent positive
and negative changes, logical metrics, validation without mutation, observation-failure isolation,
detached snapshots, and stale-writer rejection. The second slice adds a storage-owned CAS revision,
runner restoration, active Entity storage resolution, the in-memory default capability, a custom
adapter escape hatch, and an executable Materializer handoff. Durable provider adapters remain the
next Ontahi slice; PostgreSQL now supplies the contract through the same Data Graph storage and
pool, with a host-applied internal snapshot table. Atlas can begin its first characterization-backed
adoption seam; MySQL support remains later provider work rather than a prerequisite for that proof.
