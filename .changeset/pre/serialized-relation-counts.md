---
'@ontahi/core': minor
'@ontahi/postgres': minor
'@ontahi/supabase': minor
---

Add portable `relationConstraint.countAtMost(...)` metadata and prospective in-memory enforcement
for direct to-many Relations. PostgreSQL now serializes competing additions on the destination
endpoint before evaluating the aggregate from a fresh transaction snapshot, while Supabase fails
closed until its RPC can provide the same authority-serialized guarantee.
