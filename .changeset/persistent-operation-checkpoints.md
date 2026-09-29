---
'@ontahi/core': minor
'@ontahi/supabase': minor
---

Persist explicit Task execution checkpoints so registered named-step Operations can resume pending
interactions in a new in-process runtime. Store checkpoints in the Supabase task adapter and keep
the private execution state out of public Task snapshots.
