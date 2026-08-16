# 132. Durable Invocation Identity And Idempotency

Status: next

Canonical ID: `ontahi://plans/132-durable-invocation-identity-and-idempotency`

## Summary

Make durable operation idempotency an enforceable runtime contract rather than reflected metadata.
Preserve stable ingress and request identity through operation dispatch, derive an explicit
idempotency key for durable starts, and define observable behavior for every declared policy.

## Context

Ontahi currently declares and reflects `allow-concurrent`, `reuse-running`, `skip-if-completed`,
`replace-running`, and `queue-after-current`. The durable runner does not pass that declaration to
the task runtime, however, and a start without an explicit `runId` generates a new identity.

HTTP ingress already extracts a provider `deliveryId`, but the graph ingress dispatcher forwards
only operation identity and payload. A retried external delivery can consequently create another
durable run even when the operation advertises an idempotency policy.

Reusing `deliveryId` directly as `runId` would collapse distinct concepts and would not implement
the policy matrix. Request/delivery identity, idempotency identity, run identity, and attempt
identity need explicit roles.

## Scope

1. Define transport-neutral request and delivery identity on operation invocation context.
2. Preserve authenticated HTTP ingress identity through the canonical dispatcher.
3. Define a stable, namespaced durable idempotency key derived from declaration metadata and
   invocation context.
4. Specify and enforce each durable idempotency policy atomically at the task-runtime boundary.
5. Make duplicate, reused, replaced, and queued outcomes observable through typed results,
   telemetry, and task state.
6. Define retry expectations for external effects without promising exactly-once execution.

## Non-Goals

1. Do not equate provider delivery identity with task run identity.
2. Do not claim exactly-once delivery or exactly-once external side effects.
3. Do not require HTTP concepts in Core operation or task contracts.
4. Do not design distributed coordination beyond the minimum storage/runtime atomicity needed by
   the first proof.
5. Do not implement compensating business behavior generically; operations own domain-specific
   compensation.

## Identity Model To Prove

1. **Request identity** correlates one semantic invocation across transport retries.
2. **Delivery identity** identifies a provider delivery within a namespaced source.
3. **Idempotency key** selects the concurrency and reuse domain for one durable operation.
4. **Run identity** identifies one accepted execution lifecycle.
5. **Attempt identity** distinguishes retries within that run when a runtime exposes attempts.

The first implementation may derive the idempotency key from provider, source, operation, and
delivery identity, or from the operation's declared `key(input)`. The serialized key must be stable,
bounded, and scoped so unrelated providers or operations cannot collide.

## Policy Semantics To Specify

1. `allow-concurrent`: every accepted invocation creates a distinct run.
2. `reuse-running`: an equivalent request returns the existing non-terminal run.
3. `skip-if-completed`: an equivalent completed run is returned or reported as already completed
   without executing effects again.
4. `replace-running`: replacement and cancellation ordering are atomic and observable.
5. `queue-after-current`: equivalent work is queued behind the active run without an unbounded
   duplicate queue.

For each policy, define behavior for queued, running, completed, failed, and cancelled runs, plus
storage races between concurrent starters.

## External Effects And Retries

Ontahi can make task acceptance and state transitions atomic within a capable task store. It cannot
make arbitrary third-party effects exactly once. Durable steps must expose whether an effect is
safe to retry, protected by a provider idempotency key, or requires operation-owned reconciliation
or compensation after an ambiguous failure.

An unrecoverable or ambiguous effect must remain visible as failure state and evidence. The runtime
must not silently start a new run merely to hide uncertainty.

## Execution Slices

- [ ] Add request/delivery identity to invocation context without coupling Core to HTTP.
- [ ] Propagate normalized HTTP ingress identity through operation dispatch and durable triggers.
- [ ] Add a first-class idempotency start contract distinct from optional `runId`.
- [ ] Prove atomic `reuse-running` and `skip-if-completed` behavior in the in-process storage/runtime.
- [ ] Define and test failed, cancelled, and concurrent-start behavior.
- [ ] Implement or explicitly defer `replace-running` and `queue-after-current` based on the storage
      coordination they require.
- [ ] Project actual enforced capabilities through reflection rather than declaration alone.
- [ ] Prove one retried HTTP delivery starts or reuses the expected durable run end to end.
- [ ] Document external-effect retry and reconciliation responsibilities.

## Acceptance Checklist

- [ ] A repeated ingress delivery retains one stable request/delivery identity through dispatch.
- [ ] Declared idempotency policy changes observable task-start behavior.
- [ ] Concurrent equivalent starts cannot bypass the selected policy through a storage race.
- [ ] `runId`, idempotency key, and delivery identity remain distinct in contracts and telemetry.
- [ ] Reflection distinguishes declared policy from runtime enforcement capability.
- [ ] Tests cover every implemented policy across non-terminal and terminal task states.
- [ ] Documentation makes the at-least-once external-effect boundary explicit.

## Verification

1. Focused Core tests for invocation identity and task-start policy semantics.
2. Runtime task-store conformance tests for atomic duplicate handling.
3. HTTP ingress integration test with two deliveries carrying the same provider delivery identity.
4. Reflection assertions proving only enforced policy capabilities are advertised.

## Open Questions

1. Should request identity be a field on `OperationInvokeRequest` or invocation context established
   by the transport adapter?
2. Does a declared `key(input)` override delivery-derived identity or compose with it?
3. Which terminal states are reusable for `skip-if-completed`?
4. Can `replace-running` be honest without cooperative cancellation guarantees from every runtime?
5. Should `queue-after-current` coalesce equivalent queued work or preserve every caller intent?
