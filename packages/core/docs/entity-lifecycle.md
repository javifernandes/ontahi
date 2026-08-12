# Entity Lifecycle Modules

This document describes the current house style for domain areas that have real lifecycle, policy, and event behavior.

It is generic guidance extracted from BookOps domain work. The examples below are BookOps examples because they are the first proof points, not because `@ontahi/core` owns those product domains.

For the longer product direction that makes these domain modules more important, see [Plan 99: Semantic Editorial Workflows](../../../../plans/backlog/99-semantic-editorial-workflows.md). For package extraction, see [Plan 100: Ontahi Framework Extraction](../../../../plans/done/100-ontahi-framework-extraction.md).

It is not a rule that every feature must use this shape.

It is the preferred shape when a domain concept has:

1. meaningful state transitions
2. permission or policy rules
3. domain events
4. enough behavior that a flat feature folder becomes hard to navigate

## Core Idea

Use cases remain orchestration boundaries.

They should still own:

1. runtime auth and requirements
2. loading the needed state
3. calling domain transitions
4. persistence orchestration
5. dispatching effects and events

But they should not keep accumulating all domain semantics inline.

When a domain area becomes rich enough, split it into domain modules organized by entity or policy boundary.

## Preferred Shape

Prefer folder-based domain modules.

Example shape:

```txt
feature/
  audience/
    audience.policy.ts
  thread/
    thread.ts
    thread.policy.ts
    thread.projection.ts
    createThread.ts
    deleteThread.ts
  message/
    message.ts
    message.policy.ts
    replyThread.ts
    deleteMessage.ts
```

The exact folder names depend on the domain.

The point is:

1. organize by domain boundary, not by artifact suffix alone
2. keep local policy close to the thing it governs
3. keep use cases close to the lifecycle they orchestrate

## What Goes Where

### `*.policy.ts`

Policy modules answer:

1. who may perform an action
2. under what conditions
3. based on which state

Examples:

1. thread deletion permissions
2. owner-only sharing changes
3. audience access checks

### `*.ts` entity or lifecycle module

This module holds the pure domain transition logic.

Typical contents:

1. normalization helpers
2. transition functions
3. domain draft creation
4. default event drafting

Current preferred transition shape:

1. input goes in
2. `drafts + events` come out

The use case then persists those drafts and dispatches the events explicitly.

### `*.projection.ts`

Projection modules answer:

1. how storage rows become domain read models
2. how domain read models become UI-oriented shapes

Do not mix these into lifecycle modules unless the feature is still very small.

### `*.loaders.ts`

Loader modules answer:

1. which related records must be loaded
2. which not-found or invalid states must be converted into domain failures

They are useful, but they are not entities.

### Use case files

Use case files remain the public operation boundary.

Good use case responsibilities:

1. require auth
2. load needed state
3. apply policy
4. call a transition
5. persist
6. dispatch effects

## What We Have Proven

This shape is now validated in two real feature families.

### Conversations

Current structure:

1. `audience/`
2. `thread/`
3. `message/`

What this proved:

1. thread and message lifecycle belong in separate folders
2. audience access rules should not be forced into thread/message modules
3. transition helpers can return drafts plus default domain events cleanly

### Sharing

Current structure:

1. `book-sharing/`
2. `invite/`
3. `collaborator/`

What this proved:

1. `PendingInvite` is a real lifecycle boundary
2. `book-sharing` is better treated as a policy/configuration surface than as a rich entity
3. collaborator removal is its own operation family and should not be forced into invite flow

## Heuristics

Use this shape when:

1. a flat `shared.ts` starts mixing policies, loaders, projections, and transitions
2. several use cases revolve around the same lifecycle
3. events are clearly tied to state changes in one domain concept

Do not force this shape when:

1. the feature is mostly read-only
2. the logic is mostly repository mapping
3. the behavior is too small to justify extra folders

Not everything is an entity.

Some concepts should remain:

1. audience policies
2. access policies
3. projections
4. loaders

The goal is better domain structure, not object-model maximalism.
