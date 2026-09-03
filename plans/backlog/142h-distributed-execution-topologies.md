# 142h. Distributed Execution Topologies

Status: backlog

Canonical ID: `ontahi://plans/142h-distributed-execution-topologies`

Source plan: [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)

## Summary

Specify how Ontahi execution requirements map onto distributed storage, offline queues,
replication, and convergence only after concrete topology evidence exists.

## Scope

1. Model storage and execution topology independently from authored domain semantics.
2. Distinguish authority-serialized guarantees from separately proven merge-safe guarantees.
3. Record offline queueing, replication, conflict, retry, and reconciliation assumptions.
4. Define inspectable availability when a runtime cannot satisfy the required guarantees.

## Non-Goals

1. Do not promise generic distributed transactions.
2. Do not equate eventual consistency, CRDT use, or retry with invariant preservation.
3. Do not publish a capability vocabulary without a concrete second topology.

## Acceptance Checklist

- [ ] One concrete distributed topology supplies the motivating evidence.
- [ ] Required guarantees are semantic and testable rather than provider labels.
- [ ] Authority-serialized and merge-safe execution remain distinct.
- [ ] Unsupported execution is explicit and fail-closed.
