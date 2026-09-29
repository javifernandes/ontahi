# 153f. Queue-Backed Task Runtime

Status: backlog

Canonical ID: `ontahi://plans/153f-queue-backed-task-runtime`

Parent: [153c. Interactive And Resumable Operation Execution](../current/153c-operation-interactions-and-resumption.md)

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
