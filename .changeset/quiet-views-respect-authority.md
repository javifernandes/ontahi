---
'@ontahi/core': patch
'@ontahi/sql': patch
'@ontahi/postgres': patch
'@ontahi/mysql': patch
'@ontahi/supabase': patch
---

Apply receiver-owned Graph Read policy scopes to nested Relation populations before ordering,
limits, and materialization across the in-memory, PostgreSQL, MySQL, and Supabase runtimes.
