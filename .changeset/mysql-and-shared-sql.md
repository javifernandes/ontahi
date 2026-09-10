---
'@ontahi/sql': minor
'@ontahi/mysql': minor
'@ontahi/postgres': patch
'@ontahi/core': patch
---

Add MySQL 8.4/InnoDB storage with exact CRUD results, explicit-target upsert, primary-key updates,
Entity Mutation deltas, direct/many-to-many/ordered Relationship Commands, transactions, command
savepoints, and reflected Entity data. Include concurrent constraint tests and a Todo Express
configuration with persistence verified across host restarts.

Extract shared mappings, query compilation, and read materialization into @ontahi/sql while
preserving PostgreSQL's public entrypoints and provider-owned mutation implementation.

Preserve explicit relation mappings during Core application composition so physical join mappings
remain available to the storage adapter. Date/time, JSON, large-number conformance, and broader
schema diagnostics continue separately in Plan 151b.
