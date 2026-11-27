# 153g. Durable Runtime Follow-ups

Status: backlog

Canonical ID: `ontahi://plans/153g-durable-runtime-follow-ups`

Parent: [153f. Queue-Backed Task Runtime](../done/153f-queue-backed-task-runtime.md)

The current Durable Operation contract has executable evidence across PostgreSQL, Vercel Workflow,
and LangGraph. Each follow-up needs its own host scenario and evidence in the
[conformance matrix](../../docs/durable-operation-conformance.md).

- Renew PostgreSQL worker leases during long-running steps. Prove renewal, expiry and takeover,
  and fencing after cancellation with independent workers and database time.
- Define distinct retry eligibility, backoff, and exhaustion for reads, idempotent commands,
  and non-idempotent effects. Specify how persisted Interaction responses and timer wake-ups
  consume or preserve an attempt budget across worker recovery. Extend the
  [Operation retry contract](../done/162-operation-execution-resilience.md).
- Specify timed scheduling and wake-up semantics before adding delayed dispatch or dead-letter
  behavior. Parent and child run coordination needs its own semantics.
- Verify recovery when the host dies between Task admission and Vercel Workflow submission.
  Verify Ontahí effect reconciliation against a managed deployment if that evidence is needed
  beyond the engine-only managed probe and the full Local World proof.
- Compare an additional execution engine or broker only when a host requires a distinct guarantee.
  DBOS, Restate, and Temporal are engine candidates. RabbitMQ, Redis/BullMQ, and NATS JetStream
  are transport candidates. Any candidate must pass the shared contract for the guarantees it
  advertises. LangGraph hosts may also need a wake-up path independent of observation.

[132a](132a-durable-replacement-and-queueing.md) owns replacement and queue-after-current
admission policies.
