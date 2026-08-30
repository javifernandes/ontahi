---
'@ontahi/codegen': minor
'@ontahi/core': minor
'@ontahi/explorer-react': minor
'@ontahi/postgres': minor
'@ontahi/react': minor
'@ontahi/runtime-express': minor
---

Keep schema-only Entities in generated clients and add reflected Entity creation to the Explorer.

Expose forward and inverse related-instance reads, counts, and drill-downs through in-memory and
PostgreSQL storage, the Ontahi application runtime, Express, and the default React fetch client.
Make the in-memory Data Graph runtime transactional so atomic Operations have the same local
execution contract as transactional adapters.
