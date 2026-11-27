# 153f. Queue-Backed Task Runtime

Status: current

Canonical ID: `ontahi://plans/153f-queue-backed-task-runtime`

Parent: [153c. Interactive And Resumable Operation Execution](../done/153c-operation-interactions-and-resumption.md)

Shapes: [Operation Interaction](../../atlas/items/model/operation-interaction.md),
[Durable Operation](../../atlas/items/model/durable-operation.md).

## Research Goal

Test a portable open-source Task Runtime in which persistent Task storage is the execution source
of truth and a queue only wakes and distributes runnable checkpoints. Candidate transports include
PostgreSQL-backed queues, Redis/BullMQ, RabbitMQ, and NATS JetStream; engines such as Restate,
Temporal, and DBOS remain adjacent comparisons rather than assumptions.

## Required Runtime Semantics

1. Enqueue a Task Run identity, never a serialized capability or authority object.
2. Claim a runnable checkpoint by revision and lease before executing it.
3. Persist every transition before acknowledging queue delivery.
4. Stop consuming worker capacity while choice or approval is pending.
5. Atomically claim a valid Interaction response and enqueue the next execution attempt.
6. Recover expired worker leases and tolerate duplicate or reordered delivery.
7. Separate retry policy for reads, idempotent commands, non-idempotent effects, interactions, and
   timers.
8. Preserve Runtime Protocol snapshots and Activity independently of queue technology.

## Open Questions

- Whether Core needs a general checkpoint compare-and-swap contract beyond
  `claimInteraction`.
- Whether leases belong in `TaskStorage`, an execution store, or a runtime-specific side table.
- How run cancellation, delayed wakeups, dead-letter handling, and parent/child Operations compose.
- Which minimum adapter can demonstrate the semantics without becoming an infrastructure product.

## PostgreSQL first slice

The Task run table doubles as the runnable queue for explicit execution. Admission writes the
initial checkpoint with the run. Workers poll only registered Task IDs, take a PostgreSQL row
lease for one run, then read the current checkpoint under that lease. The worker uses that same
connection for checkpoint writes and frees the claim when the run reaches a terminal state or
waits for approval. Claiming an approval response makes the run runnable in the same storage
update.

Run the ONT-132 reconciliation conformance cases with the PostgreSQL worker. Prove that a
competing worker skips a held claim, and that a new worker recovers the same run and remote
customer after the original worker stops with a committed remote write.

The worker persists Event waits and releases its lease. A later poll registers the
subscription against retained PostgreSQL occurrences and atomically takes one continuation
before acknowledging the Event delivery. The integration proof publishes duplicate ingress
while no worker is active and races two recreated workers against the waiting run.

PostgreSQL records deferred Task snapshots in the same transaction as each Task update.
Observation streams start at the current snapshot and read subsequent commits in order. The
cross-process proof observes an approval wait and completion even when several writes happen
between polls. The journal retains the latest 256 observations per run.

A Task claim has a fixed database-clock deadline and a fencing token checked by its state
writes. A competing worker can resume an expired checkpoint with a fresh token while the old
session is still open. Trusted host cancellation revokes the token. Running cancellation
preserves unresolved effect evidence and prevents duplicate admission under the same key.

Timed scheduling and lease renewal remain open. Host applications own polling, Task
registration, Event declarations, and the authorization boundary for cancellation.

The PostgreSQL worker runs the shared [Durable Operation conformance contract](../../docs/durable-operation-conformance.md).
Provider-specific transaction failure and stale Event delivery cases remain in the PostgreSQL
integration suite.
