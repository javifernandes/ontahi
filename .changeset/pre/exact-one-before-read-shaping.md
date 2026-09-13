---
'@ontahi/core': patch
'@ontahi/sql': patch
'@ontahi/supabase': patch
---

Validate exact-one Selection membership before read limits, including policy-imposed limits and
related-root reads. PostgreSQL and MySQL probe for a second match in the same SQL statement;
Supabase requests an exact count with the rows so server row caps cannot masquerade as uniqueness.
Supabase exact-one reads fail closed when exact count metadata is unavailable.

Enforce the same cardinality contract for counts, reject contradictory exact-one reads with
`limit(0)`, and preserve cardinality diagnostics through Effect-backed read dispatchers. Nullable
first-result and existence intent, many-result shaping, and atomic mutation semantics are unchanged.
