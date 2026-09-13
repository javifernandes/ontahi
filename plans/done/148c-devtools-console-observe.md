# Observe queries from the Devtools Console

Status: done

## Goal and scope

Complete the browser debugging loop after PR #157: run an existing many-query expression once with
Run, or continuously with Observe / Stop. Use the application's graph observation transport so
Activity captures real stream events and the connected client cache supplies History evidence.

The supported protocol is v1 mode run with many cardinality. Contextual v2 selections and scalar
terminals remain unsupported; do not silently downgrade them. No new language syntax is required.

## Behavior

- Keep one Console execution active. Submitted source, identity, transport and cache stay bound to
  the observation. Later edits remain drafts; sort/limit execution controls wait for Stop.
- Receive snapshots into the existing Visual/JSON result view and normalize known Entity rows into
  the connected client cache, using the declared base for discovered variant roots.
- Keep observing across Devtools tabs. Stop on explicit Stop, drawer close/unmount, transport or
  cache replacement, and execution identity changes. Ignore late results after cancellation.
- Preserve the last snapshot after stop/completion/errors, report failures and update count.
- Do not remove canonical entities merely because a new query snapshot no longer contains them.
- Observation does not create a retained output skeleton; normalized entity snapshots follow the
  same cache reconciliation boundary as the runtime graph client.

## Acceptance

- [x] Observe/Stop works in both Console dialects without changing Run semantics.
- [x] Unsupported expressions/transports cannot start an observation.
- [x] Updates appear in Console, Activity and connected cache/history.
- [x] Stop/unmount/replacement/authority changes release the stream and ignore late results.
- [x] Focused tests and affected package validation pass; Todo browser proof observes a real change.

The independent [operation output semantics work](../backlog/operation-output-cache-semantics.md)
remains deferred.

## Verification and closure

- Devtools full coverage suite: 19 files / 145 tests passed. Focused Observe suite: 16 tests passed,
  including a final recheck of Run → Observe and cancellation lifetime cleanup.
- Devtools typecheck, lint, package build and Todo production client build passed.
- Browser proof against Todo's actual memory server and WebSocket: Observe on
  `TodoItem.where(completed = false).many()` returned three rows; completing a TodoItem in the
  application produced a second snapshot with two rows. Activity retained both snapshots in one
  observation. Stop produced an aborted terminal event and retained the received results.
- The browser proof exposed the strict observation frame boundary: unlike Run, Observe must not
  request `includeCapabilities`. The Console uses its separate capability discovery; a regression
  assertion preserves the observation request shape.
- UI tests cover both dialects, cache/history writes, tab navigation, fixed submitted source,
  unsupported scalar/v2 expressions, absent observation capability, late snapshots after stop or
  replacement, first-snapshot cancellation, setup failures, natural completion and restart.

The slice is complete. Contextual/scalar observation protocol support and historical Operation
output declarations remain outside this intervention.
