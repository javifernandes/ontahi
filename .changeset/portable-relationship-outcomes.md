---
'@ontahi/core': major
'@ontahi/postgres': major
'@ontahi/supabase': major
'@ontahi/react': major
'@ontahi/runtime-express': major
---

Return explicit applied or not-applied Relationship Command results, add conditional
`onMismatch: 'skip'`, and preserve structured precondition and constraint diagnostics through
direct providers and the remote Express/Fetch bridge.

This replaces the raw `RelationshipDelta` previously returned by provider, remote, and React graph
executors. Those consumers must first check `result.status`; applied commands expose the exact
delta through `result.delta`, while `not-applied` commands expose a diagnostic and have no delta.
Application-bound callers must likewise narrow `result.status` before reading
`result.outcome.delta` or `result.reactions`. Existing callers that intentionally retain
failure-on-mismatch behavior can omit `onMismatch` or use `onMismatch: 'fail'`.
