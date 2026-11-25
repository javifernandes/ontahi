---
'@ontahi/core': patch
'@ontahi/postgres': patch
---

Propagate trusted webhook delivery identity and enforce atomic durable Task admission with in-memory and PostgreSQL storage. Add a provider-idempotent effect helper for explicit Task checkpoints. Apply the updated PostgreSQL Task schema before using the new storage adapter.

Explicit Task steps using `effect.reconcilable` can also reconcile a remote write by external reference and retry once after confirmed absence.

PostgreSQL can also run explicit Tasks in a separate polling worker and recover a checkpoint after the previous worker disconnects.

The PostgreSQL polling worker can persist an Event wait and later resume it once from retained delivery.

Durable Operation admission traces expose distinct run, delivery, request, and admission identities.

Deferred PostgreSQL Tasks publish committed snapshots to observers in other processes.

PostgreSQL Task workers can reclaim expired leases and cancel deferred runs while fencing stale worker writes.
