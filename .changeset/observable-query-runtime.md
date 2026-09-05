---
'@ontahi/core': minor
'@ontahi/react': minor
'@ontahi/runtime-express': minor
---

Add transport-neutral Query observation to runtime-bound reads and an in-memory implementation that
emits complete current results after successful graph commits. Add a framework-owned TaskRun Entity
and native in-process Task lifecycle observation backed by that Query capability. Project authorized
Query observations through Runtime Protocol WebSocket sessions, reconcile pushed snapshots through
the Graph Client Cache, and let Express hosts install a receiver-owned Graph observer. Adapt native
TaskRun streams into Durable Protocol progress so WebSocket hosts can push task lifecycle snapshots
without polling while preserving the existing Durable client API. Preserve public EntityRef input
inference when a schema-backed durable operation is consumed through React.
