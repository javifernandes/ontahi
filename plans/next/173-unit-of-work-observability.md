# 173. Unit of Work Observability

Status: next

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

1. [ ] Capture one real Atlas invocation and inventory observed and missing spans, including
       direct calls, nested Operations, and bound query and command execution.
2. [ ] Add Unit of Work lifecycle and graph execution instrumentation at shared runtime
       boundaries. Preserve context through Effect, asynchronous work, and child scopes.
3. [ ] Prove commit, rollback, and committed mutation delivery under the right scope. Verify
       durable task correlation separately and keep a follow-up for any uncovered runtime.
4. [ ] Verify the same contract in BookOps. Document the minimum host setup and update the
       smallest durable Ontahí item that describes the accepted contract.

## Verification

- [ ] Assert exported span parent IDs, names, and outcomes for a root Operation with a nested
      Operation, query, command, and transaction.
- [ ] Prove that rollback reports failure without reporting committed mutation delivery.
- [ ] Run overlapping invocations and verify their context remains isolated.
- [ ] Verify tracing disabled, bounded attributes, and absence of duplicated execution spans.
- [ ] Capture an Atlas trace in local SigNoz and a representative BookOps trace. Report observed
      coverage and measure overhead with tracing disabled and enabled.
- [ ] Repeat the Atlas proof against local PostgreSQL with host-configured `pg` instrumentation.
      Verify that SQL spans correlate with the semantic Operation, Unit of Work, and transaction.
      Keep driver spans distinct from logical query and command spans. Check that SQL parameters
      and sensitive payloads are absent, and identify any gaps in provider-level instrumentation.

## Non-Goals

CPU profiling, vendor-specific setup in Core, tracing every internal function, and changing
Unit of Work transaction semantics. Host-specific spans stay with host-specific work.
