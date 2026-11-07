# 167. Durable Task Subject Discovery And Lifecycle Reactions

Status: next

Canonical ID: `ontahi://plans/167-durable-task-subject-discovery-and-lifecycle-reactions`

Shapes: [Durable Operation](../../atlas/items/model/durable-operation.md),
[Event](../../atlas/items/model/event.md).

## Summary

Let applications reconnect durable execution to domain context without inventing a parallel task
index or lifecycle event bridge. A Durable Operation should be able to associate an accepted Task
Run with a typed domain subject, let authorized application code discover current or recent runs for
that subject after navigation or process restart, and declare explicit post-terminal reactions when
completion or failure must become a domain Event.

This is framework work. Consumer-specific import behavior, UI, projection publication, history,
removal, and notification copy remain owned by the consuming application.

## Context

Ontahí already provides `TaskRunRef`, durable `TaskSnapshot` lifecycle, typed progress, Fetch and
WebSocket observation, persistent Task Storage, and provider-backed executors. A client that retains
the Ref can follow one run without application plumbing.

The missing reconnect path appears when another route, browser session, or server process knows a
domain object but no longer holds the initiating Ref. BookOps currently projects Task Runs through
application-owned query operations. Atlas Source import needs the same capability for a Workspace
or Source, but the framework should not force every consumer to author an unrelated execution table
or expose Task Storage directly.

Atlas also needs a completion or failure fact from which it may derive product notifications.
`TaskSnapshot` must remain current execution state, not be repurposed as an Event stream. When an
application needs a durable fact, it should declare an explicit lifecycle reaction that emits a
typed application Event after the terminal transition is durable.

Consumer evidence:

1. `atlas://plans/145-workspace-source-durable-import-experience`
2. `bookops://plans/46-stream-runtime-and-durable-workflow-architecture`
3. BookOps `book.import-github-markdown` Task Run projection

Related framework direction:

1. [Durable Invocation Identity And Idempotency](132-durable-invocation-identity-and-idempotency.md)
2. [Queue-Backed Task Runtime](../backlog/153f-queue-backed-task-runtime.md)
3. [Durable Operations](../../docs/developers/02-core-concepts/09-durable-operations.md)
4. [Events](../../docs/developers/02-core-concepts/10-events.md)

## Scope

1. Define a JSON-safe Task subject contract with stable subject type and identity.
2. Let a Durable Operation derive or attach its subject at acceptance without placing credentials,
   live Entity instances, or runtime capabilities in Task state.
3. Persist subject identity in Task Storage and expose it in reflected Task snapshots/list items.
4. Define a provider-neutral query/inspection capability for bounded current or recent runs by
   exact subject.
5. Keep authorization application-owned: the framework supplies the semantic selector and storage
   capability, while the host decides whether a Principal may inspect that subject.
6. Define explicit terminal lifecycle reactions that run once per durable terminal transition and
   may emit registered application Events through the configured Event Runtime.
7. Preserve causal identity from operation invocation through Task Run and emitted Event occurrence.
8. Prove the contract in two consumers or examples without importing their domain vocabulary into
   Core.

## Non-Goals

1. Do not add Atlas Workspace, Source, repository, import, projection, notification, or onboarding
   concepts to Ontahí.
2. Do not make Task Storage a general application query database or expose arbitrary Task scans to
   clients.
3. Do not turn every terminal Task transition into an Event automatically.
4. Do not define recipient-facing notification entities, copy, read state, channels, or delivery
   preferences.
5. Do not duplicate the idempotency and concurrency policy work owned by Plan 132.
6. Do not claim portable cancellation; runtimes still lack one shared enforceable cancellation
   request capability.
7. Do not promise rollback or compensation for effects already completed by a Task.

## Proposed Form

```ts
reconcile: operation({
  input: ReconcileInput,
  output: ReconcileResult,
  durable: {
    runtime: 'vercel-workflow',
    progress: ReconcileProgress,
    subject: input => ({ type: 'workspace-source', id: input.sourceId }),
    reactions: {
      completed: ({ run, result }) =>
        SourceReconciled.emit({
          sourceId: run.subject.id,
          projectionRevisionId: result.projectionRevisionId,
        }),
    },
  },
  run: runReconcile,
});
```

The exact reaction API remains to be proved. The invariant is more important than this syntax:
terminal state must be durable before an occurrence is accepted, retry must not create duplicate
semantic occurrences, and reaction failure must remain observable without rewriting the completed
Task as failed.

Subject discovery is a server-owned capability, not an unrestricted protocol predicate:

```ts
const runs = await tasks.listBySubject({
  subject: { type: 'workspace-source', id: sourceId },
  statuses: ['queued', 'running', 'failed'],
  limit: 20,
});
```

An application operation or Query authorizes the caller and projects the result it wants to expose.

## Execution Slices

- [ ] Inventory BookOps' Task Run projection and the minimum Atlas reconnect requirement.
- [ ] Define and validate the stable Task subject schema.
- [ ] Extend Task Storage and conformance fixtures with bounded exact-subject discovery.
- [ ] Reflect subject metadata without exposing storage-private selectors.
- [ ] Prove authorized server-side discovery after losing the initiating `TaskRunRef`.
- [ ] Specify terminal reaction ordering, retry, causal identity, and failure semantics.
- [ ] Prove one typed Event emission after a durable successful transition.
- [ ] Prove reaction retry cannot create a duplicate semantic occurrence.
- [ ] Document the boundary between Task snapshot, Event occurrence, and notification projection.

## Acceptance Checklist

- [ ] A consumer can associate a Durable Operation run with one stable domain subject.
- [ ] Another request can discover that same run by exact subject without an application-owned task
      index.
- [ ] Subject discovery is bounded, provider-neutral, and protected by application authorization.
- [ ] PostgreSQL and at least one non-SQL/reference Task Storage satisfy the subject contract.
- [ ] Terminal reactions are explicit and cannot fire before the terminal state is durable.
- [ ] A retried reaction preserves one causal Event occurrence or an explicit idempotent emission
      identity.
- [ ] Task completion remains successful when a post-terminal reaction later needs retry.
- [ ] No consumer domain nouns enter Ontahí Core APIs or persistence schemas.

## Verification

1. Core validation and reflection tests for subject declarations.
2. Task Storage conformance tests for bounded exact-subject discovery and restart.
3. Runtime tests for terminal transition/reaction ordering and retry.
4. Durable Event Runtime tests for causal and duplicate-emission behavior.
5. BookOps or example migration proving removal of an application-owned Task Run index path.
6. Atlas consumer proof owned and verified in its own repository.

## Decisions

1. A Task subject links execution to domain identity; it does not make Task Run a domain Entity.
2. Authorization remains application policy, not a Task Storage concern.
3. Task snapshot is lifecycle state, Event occurrence is a durable fact, and notification is an
   application projection.
4. Terminal reactions are opt-in because many Tasks need no domain Event.
5. Idempotency and cancellation remain separate framework concerns with their own contracts.

## Open Questions

1. May one run have several subjects, or should applications choose one primary subject and encode
   other relations in domain state?
2. Is subject discovery a Task Runtime facade, Task Storage capability, or reflected application
   operation projected mechanically by Ontahí?
3. Should terminal reactions reuse Mutation Reaction semantics or define a Task-specific adapter
   over the same post-commit Effect Intent boundary?
4. What stable emission identity lets a terminal reaction retry safely across process failure?
5. Should failed and cancelled Tasks support distinct opt-in Events, or should applications derive
   those facts through an explicit recovery operation?

## Closure / Evolution

This plan closes when consumers can reconnect Task Runs to domain subjects and publish explicit
terminal facts without creating a parallel execution index or event bridge. Consumer UX and domain
workflow remain in their source repositories.
