---
'@ontahi/core': minor
---

Add typed exact Entity mutation authoring to generated client facades through `Entity.create(...)`
and Ref-bound `update(...)` / `delete()`, with runtime-bound `.run()` execution while portable
Commands and Refs remain data-only. Exact update/delete deltas retain the requested Ref and reject
a response for another instance of the same Entity.
