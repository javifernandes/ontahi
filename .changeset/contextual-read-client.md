---
'@ontahi/core': minor
'@ontahi/postgres': minor
'@ontahi/react': minor
---

Connect contextual Selection reads through application storage and remote clients. In-memory and
PostgreSQL storage declare graphReadCapabilities.relationSelections, which enables application
Graph Read v2 receivers while retaining explicit per-hop policy grants.

Remote and React graph clients discover the target's v2 capability before each contextual read,
using the same transport options for metadata and execution. Ordinary reads stay v1 with no
extra requests; missing capabilities and read denials never fall back to v1 or prefetch IDs.

Custom RemoteGraphReadTransport implementations now accept GraphReadFamilyRequest (metadata and
v1/v2 reads); narrow by kind before reading mode or selection. Contextual observation remains
unsupported pending source-change invalidation.
