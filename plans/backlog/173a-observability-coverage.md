# 173a. Observability coverage follow-up

Status: backlog

The first runtime tracing contract and its verification are recorded in
[173. Unit of Work Observability](../done/173-unit-of-work-observability.md).

- [ ] Trace committed mutation delivery separately from the provider transaction, and
      verify that a rollback emits no delivery span.
- [ ] Evaluate bounded counts of reads, writes, and committed mutations on the owning Unit of Work.
- [ ] Define what individual spans represent for streaming reads and long-lived observations.
- [ ] When another durable Task runtime adopts persisted trace context, verify attempt
      ordinals and enqueue links through its restart and retry paths.

Keep replication instrumentation deferred while replicated models are experimental.
