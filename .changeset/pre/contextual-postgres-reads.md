---
'@ontahi/sql': minor
'@ontahi/postgres': minor
---

Execute local contextual Selection reads in PostgreSQL as correlated EXISTS subqueries, without
prefetching source IDs. Nested/self relations, direct belongs-to/has-many joins, and single-identity
many-to-many joins preserve set membership before final projection, ordering, limits and counts.
SQL compilation requires explicit receiver-owned Selection mappings; other SQL runtimes remain
opted out. Composite edge joins and virtual filter fields fail explicitly. Commands and graph read
protocol v1 still reject relational membership until their authority/transport contracts are implemented.
