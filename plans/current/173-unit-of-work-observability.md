# 173. Unit of Work Observability

Status: current

## Summary

Make a configured OpenTelemetry host see the execution structure that Ontahí already knows.
Follow an invocation through its Unit of Work, nested Operations, graph reads and mutations,
transaction outcome, and committed mutation delivery. Keep instrumentation at shared runtime
boundaries so application authors configure it once.

## Context and Evidence

Core currently exposes a vendor-neutral telemetry adapter and instruments Operation execution and
selected intents. A host supplies the OpenTelemetry SDK and exporter. Audit the actual coverage
and parentage of bound graph execution before adding spans. BookOps wires the adapter at startup
and serves as a second host for compatibility verification. Atlas reconciliation is the consumer
case. [Atlas PR #128](https://github.com/javifernandes/atlas/pull/128) added child spans for
projection assembly. A local PostgreSQL bootstrap exported the reconciliation Operation,
assembly stages, and driver spans in one SigNoz trace. Use that trace as a baseline to verify
which logical query, command, and transaction boundaries the runtime exposes. The CPU profiler
remains the tool for synchronous hotspots.

Related work: [Unit of Work runtime scope](../done/74a-unit-of-work-runtime-scope.md),
`atlas://plans/156-adaptive-materialization-policy`, and
`bookops://plans/42-observability-telemetry-weaving`.

### Baseline trace

Local SigNoz retained Atlas's PostgreSQL reconciliation trace from 2026-11-25 13:32 UTC
(`78ec883dc0454ce47e85f092dc30a9cb`). The reconciliation span parents both Atlas's
projection assembly span and the driver spans for BEGIN, SELECT, INSERT, DELETE, and COMMIT.
Atlas's assembly spans retain their hierarchy. The trace shows no distinct Unit of Work,
logical query or command, transaction, or committed mutation delivery span. This capture does
not establish coverage for direct calls or nested Operations.

In Core, `withDataGraphTransaction` seals the child Unit of Work's journal inside the
transaction callback. It merges the journal into the parent and executes queued work after
the provider succeeds. Instrument the provider transaction and post-commit delivery as
separate boundaries so delivery failure cannot be reported as rollback.

The first instrumentation slice adds `ontahi.runtime.transaction` around the provider
transaction. It records `committed` on provider success and `transaction_failed` on failure.
The provider contract does not certify rollback for every failure. Post-commit work runs
outside this span. Exported parent IDs and host traces remain to be verified.

Child Units of Work emit `ontahi.runtime.unit_of_work` at the boundary that creates
their isolated resource scope. An atomic transaction creates its child scope inside the
provider callback, so the transaction span encloses that scope.

The Runtime Protocol invocation journal supplies an outer Unit of Work span for requests
that own a journal. Direct calls and durable attempts still need separate verification.

The repository agent guidelines now ask contributors to review telemetry at runtime
execution boundaries. Model resources already collect attempt and usage evidence through
`withModelResourceAttempt`. Both Operation model execution and intent interpretation now
emit `ontahi.runtime.model.attempt` there. The span reports success, admission rejection,
or attempt failure. Provider errors are rethrown to the caller after the span ends.

Replication has two distinct candidates: collection observation and acceptance in
`createReplicatedCollectionAcceptanceRunner`, and derivation in the materializer runner.
Trace actual attempts at their server callers and distinguish skipped derivations from work
performed. Avoid per-record spans and keep records and frontiers out of attributes.
The PostgreSQL example composes the acceptance runner at the host. Keep the model runners
independent of server configuration and verify instrumentation at an actual host call site.

A local OpenTelemetry SDK exporter captured direct calls against composed in-memory storage.
Exported parent IDs verified `TraceTodo.list → unit_of_work → read` and
`TraceTodo.rename → unit_of_work → command`, with exactly three spans per trace. This proof
covers effect-based get, run, count, and command boundaries through representative calls;
streams and observation lifecycles remain separate verification cases.

A second proof used PostgreSQL and host-configured `pg` instrumentation in a temporary
schema. The exported parent IDs verified direct `TraceTodo.outer` → root Unit of Work →
transaction → child Unit of Work → nested `TraceTodo.change`. The nested Operation owned
exactly one read and one command span. The driver SELECT and UPDATE were children of their
respective logical spans. BEGIN and COMMIT were direct children of the transaction, which
reported `committed`. A read after the invocation verified the updated row.

The rollback variant failed after a real UPDATE and after the child journal recorded a
mutation. The exporter captured driver ROLLBACK under the failed transaction span and
no COMMIT. The row retained its original value and the parent journal stayed empty.
A queued post-commit callback ran once in the commit control and never in the rollback
variant. This proof exercises the journal and post-commit queue; it does not exercise
delivery through a Runtime Protocol subscriber.

A focused Runtime Protocol test complements the PostgreSQL proof using an in-memory
transaction and a single active Graph Read subscriber. A rollback produces no refresh.
The subsequent commit produces exactly one refresh with cause `committed-mutations`.

### Durable correlation baseline

A local OpenTelemetry SDK capture started an in-process Task under a host enqueue
span. The Task invoked an atomic Operation that failed on ordinal 1 and succeeded on
ordinal 2. The Task snapshot reached completed. The exported Operation inherited the
host enqueue span as its parent. Both transaction spans were siblings under that
Operation, each with its own child Unit of Work. The first transaction was marked
failed and the second committed.

The capture had no distinct Task execution or retry-attempt spans, ordinal attributes,
or trace links. The shared trace came from the active launch context in the same process.
It does not verify persistence or propagation through storage, a separate worker, or
resumption. Keep Operation retries distinct from durable execution attempts when adding
those boundaries.

A two-process PostgreSQL proof persisted an interaction checkpoint. The first process
started the Task and exited at waiting. A second process loaded the same Task run,
responded to the interaction, and completed from that checkpoint. A host probe emitted
a step span in each process. Both step spans inherited their local host parent, but the
trace IDs differed and neither had a trace link. The Task run identity survived in
storage; trace context and a telemetry execution ordinal did not. This exercises
explicit checkpoint resumption in a fresh process, not a queue claim or lease retry.

After adding durable correlation, the same two-process proof exported one
`ontahi.runtime.task.attempt` per process. The first execution had ordinal 1 and
the resumed execution had ordinal 2. Both links targeted the original enqueue
span's exact trace and span IDs. The resumed attempt retained its local parent,
and its checkpoint step was a child of the attempt span. The proof used a fresh
PostgreSQL table and completed with the expected result.

After integrating PR #357, a deferred Task was enqueued in a host process and claimed
by a PostgreSQL worker in another process. Once its lease expired, a second worker
claimed and completed the same run while the first worker was still active. The stale
worker's completion was fenced. The exported attempt spans had ordinals 1 and 2 and
linked to the same enqueue span in the original trace. Ordinal allocation uses the same
lease predicate as the worker's other writes.

## Proposed Form

A representative trace starts with server ingress or a task execution, then an Operation and
its Unit of Work. Nested Operations, executed queries and commands, and transaction scopes
appear under their real execution parent. Record committed, rolled back, or failed outcomes
at the boundary that knows them. Correlate work that crosses a durable queue with propagation
or trace links as appropriate. Distinguish retries and resumed attempts from nested calls.

For example, an Atlas reconciliation trace could show the following execution boundaries.
The exact parentage follows the active runtime scopes.

```text
atlas.projection.reconcile
└── Unit of Work
    ├── Query: read current projection
    ├── assemble-projection-dataset (Atlas)
    │   └── infer-mentions (Atlas)
    └── Transaction
        └── Command: publish projection
            └── PostgreSQL driver spans (host instrumentation)
```

Count reads, writes, and committed mutations with bounded attributes on the owning scope.
Emit one span at each chosen execution boundary and avoid duplicating the same action across
facade, dispatch, and provider layers. Names and attributes use stable schema identities where
available. Exclude raw SQL parameters, input and output payloads, credentials, and user content.
Keep sampling and exporter configuration host-owned. Core stays provider-neutral and the
unconfigured path stays no-op.

## Execution Slices

1. [x] Capture one real Atlas invocation and inventory observed and missing spans, including
       direct calls, nested Operations, and bound query and command execution.
2. [x] Add Unit of Work lifecycle and graph execution instrumentation at shared runtime
       boundaries. Preserve context through Effect, asynchronous work, and child scopes.
3. [x] Prove commit, rollback, and committed mutation delivery under the right scope. Verify
       durable task correlation separately and keep a follow-up for any uncovered runtime.
4. [x] Verify the same contract in BookOps. Document the minimum host setup and update the
       smallest durable Ontahí item that describes the accepted contract.

## Verification

### Local host rehearsal

Installed all candidate Ontahí dependencies from local tarballs in isolated Atlas
and BookOps checkouts based on their alpha.26 upgrade branches. Atlas reconciled 60
fixed source records in fresh local PostgreSQL schemas. BookOps invoked its
`fetchBookInfo` Operation with real reference resolution, in-memory storage and a
stubbed book information backend. Warmups were excluded from latency samples, and
final exporter shutdown was outside the timed calls.

| Host    | Samples per mode | Off p50 / p95 (ms) | Memory p50 / p95 (ms) | SigNoz p50 / p95 (ms) |
| ------- | ---------------: | -----------------: | --------------------: | --------------------: |
| Atlas   |               12 |      86.41 / 95.42 |        90.57 / 121.96 |        87.94 / 105.35 |
| BookOps |              500 |      0.083 / 0.174 |         0.111 / 0.340 |         0.111 / 0.312 |

SigNoz retained 308 Atlas spans over 14 invocations, including warmups. Each
representative trace included the reconciliation Operation, two Units of Work, one
committed transaction, three reads and fifteen commands. The BookOps service
retained 1,800 spans over 600 invocations, including warmups. The Operation
parented a Unit of Work which parented the read. Across both services, the exported
span attribute keys were `ontahi.scope`, `ontahi.runtime`, `ontahi.outcome`,
`ontahi.transaction.outcome` and the Atlas trigger `ontahi.extra.trigger`.
This run used batched export and did not enable driver telemetry. The estimates
describe local invocation latency with these fixtures.

### BookOps HTTP and Atlas PostgreSQL driver rehearsal

The real BookOps Next.js route `POST /api/data-graph/domain-operations` invoked
`Book.fetchBookInfo` with a synthetic missing slug and local Supabase. All 70
requests returned HTTP 200 with the expected null result. SigNoz showed the HTTP
route, Operation, logical read, and Supabase fetch in the same trace. The logical
read succeeded and was a direct child of the Operation. There was no root Unit of
Work span on this invocation path. The host's Supabase fetch span included the
synthetic filter in `http.url`, a query-string sanitization gap. The 60 timed
requests measured 56.77 ms p50 and 451.78 ms p95 with export on in Next dev.
These HTTP timings describe a development probe with no telemetry-off baseline.

The follow-up rebuilt the Core tarball and patched BookOps's Supabase fetch
adapter. The same HTTP request returned 200. SigNoz showed the root Unit of Work
between the Operation and the logical read. The Supabase span retained the origin
and path in `http.url`. No exported string attribute in that trace contained
the synthetic filter value.

With the BookOps dev server stopped, Atlas reconciled the same 60 records in 60
measured invocations per mode after 8 warmups. Off measured 82.39 / 91.91 ms
p50 / p95. Memory measured 82.47 / 91.31 ms and SigNoz 83.35 / 91.12 ms.
Both enabled modes included PostgreSQL driver instrumentation, with enhanced
database reporting disabled. The isolated SigNoz run retained 3,852 unique spans,
including 68 reconciliation Operations and 2,355 PostgreSQL query spans.
Driver SELECTs nested under logical reads and INSERTs/DELETEs under logical
commands. Transaction BEGIN and COMMIT nested under the Ontahí transaction
where applicable. Atlas's own SQL also appeared directly under Units of Work.
The driver emitted `db.query.text`, `db.namespace`, `db.system.name` and
`server.address`. The collected driver spans had no parameter attribute keys.

### Acceptance checks

- [x] Assert exported span parent IDs, names, and outcomes for a root Operation with a nested
      Operation, query, command, and transaction.
- [x] Prove that rollback reports failure without reporting committed mutation delivery.
- [x] Run overlapping invocations and verify their context remains isolated.
- [x] Verify tracing disabled, bounded attributes, and absence of duplicated execution spans.
- [x] Capture an Atlas trace in local SigNoz and a representative BookOps trace. Report observed
      coverage and measure overhead with tracing disabled and enabled.
- [x] Repeat the Atlas proof against local PostgreSQL with host-configured `pg` instrumentation.
      Verify that SQL spans correlate with the semantic Operation, Unit of Work, and transaction.
      Keep driver spans distinct from logical query and command spans. Check that SQL parameters
      and sensitive payloads are absent, and identify any gaps in provider-level instrumentation.

The concurrency proof synchronized two PostgreSQL invocations after their reads and before
their updates. Both committed different rows. Each export had a distinct trace ID, one logical
read and command, and parent IDs entirely within that invocation's trace.

### Deferred coverage

- Add a span for committed mutation delivery and bounded counts per Unit of Work.
- Evaluate span boundaries for streams and long-lived observations.
- Validate the same durable attempt contract if another Task runtime adopts persisted trace links.

## Non-Goals

CPU profiling, vendor-specific setup in Core, tracing every internal function, and changing
Unit of Work transaction semantics. Host-specific spans stay with host-specific work.
Instrumentation for experimental replicated models is deferred until the runtime is more general.
