# 132. Durable Invocation Identity And Idempotency

Status: done

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

## First Vertical Proof

Use an authenticated webhook to invoke a durable Operation that creates a customer in a remote
system. Deliver the webhook twice and verify that the policy selects one run. Then simulate the
remote create committing before the worker can persist its response. Resume that same run and
verify that the provider receives the same effect key and payload and creates only one customer.
Use a fake provider that enforces its idempotency contract and can drop the first response after
committing.

The Operation declares the remote create as an effect and receives its callable capability from
the execution context. The runtime persists the logical effect occurrence, provider key, and input
identity before making the call. The occurrence is stable across attempts of the same run and
distinct across separate occurrences of the effect within that run. Reject replay with different
input for an existing occurrence. Record confirmed outcomes so resumed execution can reuse them.
If the provider guarantee no longer applies and the outcome remains unknown, surface the ambiguous
state for reconciliation.

The first effect supports provider idempotency. The second effect reconciles through an external
reference. It recovers a matching record, retries after authoritative absence, and retains its
checkpoint when the provider cannot confirm the outcome. Compensation remains a separate effect
capability. The reconciliation conformance suite runs unchanged against in-memory and
PostgreSQL Task Storage and recreates both the runtime and PostgreSQL storage adapter for the
lost-response case. Reflection can describe declared effects and the recovery
guarantees the runtime enforces for them. Coverage of arbitrary TypeScript remains unverified
unless the execution boundary enforces that all relevant effects go through declared capabilities.

## Execution Slices

- [x] Add request/delivery identity to invocation context without coupling Core to HTTP.
- [x] Propagate normalized HTTP ingress identity through operation dispatch and durable triggers.
- [x] Add a first-class idempotency start contract distinct from optional `runId`.
- [x] Prove atomic `reuse-running` and `skip-if-completed` behavior in the in-process storage/runtime.
- [x] Define and test failed, cancelled, and concurrent-start behavior.
- [x] Implement or explicitly defer `replace-running` and `queue-after-current` based on the storage
      coordination they require.
- [x] Project actual enforced capabilities through reflection rather than declaration alone.
- [x] Prove one retried HTTP delivery starts or reuses the expected durable run end to end.
- [x] Persist one logical external-effect occurrence and reuse its provider key across attempts.
- [x] Prove the remote-commit/lost-response case in the same webhook scenario.
- [x] Document external-effect retry and reconciliation responsibilities.

## Acceptance Checklist

- [x] A repeated ingress delivery retains one stable request/delivery identity through dispatch.
- [x] Declared idempotency policy changes observable task-start behavior.
- [x] Concurrent equivalent starts cannot bypass the selected policy through a storage race.
- [x] `runId`, idempotency key, and delivery identity remain distinct in contracts and telemetry.
- [x] Reflection distinguishes declared policy from runtime enforcement capability.
- [x] Tests cover the two atomic admission policies across non-terminal and terminal task states.
- [x] A simulated worker loss after remote commit preserves the run and effect identities and creates one remote customer.
- [x] Reflection exposes declared effect guarantees without inferring coverage of arbitrary code.
- [x] Documentation makes the at-least-once external-effect boundary explicit.

## Verification

1. Focused Core tests for invocation identity and task-start policy semantics.
2. Runtime task-store conformance tests for atomic duplicate handling.
3. HTTP ingress integration test with two deliveries carrying the same provider delivery identity.
4. Reflection assertions proving only enforced policy capabilities are advertised.

## First implementation decisions

1. The host supplies request and delivery identity through Invocation Context. A declared
   `key(input)` takes precedence over a namespaced delivery key.
2. Both policies converge on active runs. Only `skip-if-completed` retains a successful terminal
   run. Failed and cancelled runs release the key unless an external effect outcome remains
   ambiguous. Those runs retain their checkpoint and surface `reconciliation-required`.
3. The native executor uses atomic storage admission. Memory and PostgreSQL support it.
   Other executors or storage combinations without atomic admission fail closed for these
   policies.
4. The first effect helper is called from an explicit execution step. Its prepared value is
   stored in the Task checkpoint. The integration proof recreates the application runtime
   against the same store after the provider commits and withholds the first response.
5. `replace-running` and `queue-after-current` are deferred to
   [132a](../backlog/132a-durable-replacement-and-queueing.md). The runtime rejects them until it
   can enforce their coordination semantics.

## Closure evidence

- [Core ingress admission](../../packages/core/src/runtime/server/durable-ingress.integration.test.ts)
  records distinct request, delivery, admission key, and run identities for concurrent repeats
  and observes the created and reused dispositions.
- [Todo Express PostgreSQL export](../../examples/todo-express/src/postgres-durable-export.integration.test.ts)
  uses the existing `TodoList.export` definition behind an authenticated fixture webhook. A
  separate worker persists the Event wait; a recreated worker completes the same run once after
  duplicate callbacks while the worker was offline.
- [153f](153f-queue-backed-task-runtime.md) delivered the reference worker lifecycle and observation.
  [153g](../backlog/153g-durable-runtime-follow-ups.md) tracks the remaining runtime work. Coverage of unrestricted Operation code remains unverified.
