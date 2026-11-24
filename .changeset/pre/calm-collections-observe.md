---
'@ontahi/core': minor
'@ontahi/postgres': minor
---

Add a provider-neutral replicated collection observer contract and in-memory acceptance runner with
bootstrap, incremental, validation, repair, idempotent change application, and stale-writer
protection. Persist accepted snapshots through a storage-owned compare-and-swap port, selecting the
active Entity storage by default while retaining a custom-adapter escape hatch. This begins
`ontahi://plans/172-replicated-collection-observer-and-acceptance-runner` and evolves
`ontahi.model.replicated-versioned-model`.
