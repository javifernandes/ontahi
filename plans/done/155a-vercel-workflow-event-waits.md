# 155a. Vercel Workflow Event Waits

Status: done

Canonical ID: `ontahi://plans/155a-vercel-workflow-event-waits`

Parent: [155. Adapter Capability Completeness](./155-adapter-capability-completeness.md)

Shapes: [Event](../../atlas/items/model/event.md),
[Durable Workflow](../../atlas/items/durable-workflows.md), and
[Durable Operation](../../atlas/items/model/durable-operation.md).

## Goal

Run the existing serializable Ontahí Task Event-wait state machine unchanged inside Vercel
Workflow. Ontahí Task Storage remains the source of public lifecycle and atomic wait claims;
Vercel owns durable execution and sleeps; the configured Event Runtime owns retained occurrence
delivery.

## Scope

1. Materialize the canonical registered Event wait from an explicit execution transition.
2. Require a retained, durable, acknowledged Event Runtime before publishing the wait.
3. Register a stable one-shot subscription and poll it using Vercel durable sleeps.
4. Atomically claim the wait in Task Storage before continuing the workflow with the occurrence.
5. Preserve occurrence, delivery, claim, ingress, and causal resume evidence.
6. Support early occurrences, duplicate/concurrent claims, timeout, cancellation, and replay from a
   persisted occurrence checkpoint.
7. Exercise the unchanged Todo `TodoList.export` execution through the adapter.

## Non-Goals

1. Do not add an Event-specific Vercel hook or expose Vercel identities in Ontahí Event contracts.
2. Do not add Event history, broker adapters, arbitrary predicates, or new Runtime Protocol APIs.
3. Do not change the semantic definition of Task Event waits or weaken their durable capability
   requirements.
4. Do not implement LangGraph Event waits in this vertical.

## Acceptance

- [x] The executor persists the same `waitingOn: event` checkpoint as the native runtime.
- [x] One durable delivery claim and one Task Storage claim resume the existing workflow run.
- [x] The resumed step receives the canonical Event Occurrence and completes normally.
- [x] An occurrence retained before the workflow observes it can still resume the wait.
- [x] Duplicate or concurrent claim attempts cannot advance the Task Run twice.
- [x] Timeout and explicit cancellation end the wait without erasing the occurrence.
- [x] Replay from a claimed occurrence checkpoint does not claim or deliver the Event again.
- [x] Missing durable Event capabilities fail before an unsupported wait is published.
- [x] Todo `TodoList.export` runs unchanged through the Vercel executor.

## Verification

Run focused executor/runtime tests, the unchanged Todo integration proof, package coverage, lint,
typecheck, build, and artifact verification. Keep provider persistence claims grounded in the
existing Event Runtime and Task Storage conformance suites rather than mocked SQL behavior.

## Closure And Evolution

The adapter now preserves the native Event-wait contract through retained delivery registration,
durable workflow sleeps, atomic Task Storage claims, canonical resume evidence, and replay from a
claimed occurrence checkpoint. LangGraph Event waits remain a separate comparison because its
opaque checkpoint adds a distinct reconciliation boundary.
