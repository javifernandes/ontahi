---
'@ontahi/core': minor
'@ontahi/postgres': minor
'@ontahi/supabase': minor
---

Add typed `if` conditions to exact Ref-targeted Entity update/delete Commands. In-memory,
PostgreSQL, Supabase, and remote execution apply identity and authorized equality conditions in one
atomic mutation, return one authority-safe rejection when it does not apply, and use a fail-closed
wire version so older servers cannot silently execute an unconditional mutation.
