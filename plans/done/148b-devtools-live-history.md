# Devtools live observations and local entity history

Status: done

## Goal

Expose query observation lifecycle and incoming snapshots in Activity, and let a developer opt into
bounded in-memory history of the entities observed by this client. This follows the Cache inspector
merged in PR #155. The independent [operation output semantics follow-up](../backlog/operation-output-cache-semantics.md)
is deliberately recorded in backlog, not folded into Devtools.

## Smallest useful slice

- Instrument Runtime Transport graph observation start, snapshots, completion, cancellation and
  errors, preserving lazy iteration, signals, consumer closure and configured payload redaction.
- Present one Activity entry per observation with semantic request summary and incoming snapshots.
- Add Record entity history in Settings, off by default. Capture a baseline on enable, then writes,
  invalidations and cache clears; retain collected snapshots when disabled, and offer explicit clear.
- Bound recording by entry count and approximate retained payload bytes. Never change application
  values, roll back its cache, persist snapshots, or let recording failures break application writes.
- Add Cache History with timestamps, a previous/current field diff and selected immutable snapshot.
  Preserve removed entities' history, keep recording while the panel is closed, and unsubscribe
  when the Devtools/cache instance is replaced or unmounted.

## Boundary and deferred work

This is a history of this client's observations, not a complete system audit. Runtime cache writes
do not yet carry observation/exchange IDs: do not infer causal links from timing or matching data.
Exact Activity-to-entity provenance links require a separate propagation contract. React hook
instances/observer counts and indirect/transitive reference navigation remain follow-ups.

## Acceptance

- [x] Instrumentation preserves graph stream semantics, including abort/error/early return.
- [x] Activity groups query snapshots and displays status/count while respecting redaction.
- [x] History recording starts disabled, is bounded, and preserves immutable snapshots.
- [x] History remains available after invalidation/clear and while recording is stopped.
- [x] Settings, live Cache and historical inspection work together without cache mutation.
- [x] Focused tests, Devtools suite, typecheck, lint/build and Todo/browser verification.

## Verification and closure

Implemented on `codex/devtools-live-history` from the merged PR #155 baseline (`5d9f605`).

- Devtools coverage suite: 18 files / 129 tests passed.
- Devtools TypeScript, ESLint and package build passed; Todo client production build passed.
- Todo memory app browser check: enabled history with 9 baseline entities, closed Devtools,
  completed a TodoItem, reopened History, filtered its identity and inspected `completed` changing
  from `false` to `true`. Other writes remained visible, including writes with unchanged values.
- Browser observation fixture: two incoming snapshots produced one Activity entry, semantic query
  title, update count and visual result table. Unit/UI tests cover payload redaction, early closure,
  abort, protocol/transport errors, pinned snapshots and retention loss.
- History tests cover detached values, cycles/BigInt, capture failures, count/byte limits,
  invalidations, cache clears, stopped intervals, panel closure, cache replacement and unmount.

The first slice is complete. Exact causal provenance, hook-instance tracking and transitive
reference navigation remain outside this slice as described above. The independent operation
output/cache semantic work remains in the linked backlog plan.
