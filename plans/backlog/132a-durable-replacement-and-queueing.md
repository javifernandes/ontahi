# 132a. Durable Replacement And Queueing

Status: backlog

Canonical ID: `ontahi://plans/132a-durable-replacement-and-queueing`

Parent: [132. Durable Invocation Identity And Idempotency](../done/132-durable-invocation-identity-and-idempotency.md)

Define and prove `replace-running` and `queue-after-current` with an executor and store that can
coordinate multiple runs under one admission key. Preserve the enforced policy distinction in
reflection and fail closed when the configured runtime cannot support the declared policy.

- For replacement, specify when the old run loses permission to execute or commit further steps,
  how cooperative cancellation and unresolved external effects affect that boundary, and when the
  replacement becomes runnable.
- For queueing, define whether repeated deliveries coalesce and how waiting, failed, cancelled,
  and completed runs release the next accepted run.
- Prove concurrent admission and recovery with two workers. Use
  [153f](../done/153f-queue-backed-task-runtime.md) for the worker coordination work.
