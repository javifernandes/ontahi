# Current Ontahi Mental Model

This document explains the current `@ontahi/core` mental model.

It is a working snapshot after the first extraction slice, not final framework documentation. The code still uses names such as `architecture(...)`, `ArchitectureDefinition`, and `web/src/architecture`; those names describe the runtime vocabulary that existed before the package rename. The package direction is now:

1. Ontahi is the generic framework.
2. BookOps is an application built with Ontahi.
3. BookOps keeps an app-local architecture facade while the generic pieces move out.

See also:

1. [Plan 100: Ontahi Framework Extraction](../../plans/current/100-ontahi-framework-extraction.md)
2. [Plan 99: Semantic Editorial Workflows](../../plans/backlog/99-semantic-editorial-workflows.md)

It describes:

1. the shared computational primitives
2. the purpose of each architectural layer
3. how runtime wiring and application wiring relate
4. how the shape looks in a simple Todo app
5. what still belongs in `@ontahi/core` versus future package slices
6. where the current design still feels frictiony or boilerplate-heavy

## Current Extraction Boundary

`@ontahi/core` is intentionally imperfect right now, but its public surface is getting narrower.

It should be read as the first stable name for the generic framework surface, not as final framework documentation. As of the Supabase, Next.js runtime, and React runtime extraction slices, core owns the technology-free graph and runtime vocabulary while the Supabase adapter lives in `@ontahi/supabase`, the action transport lives in `@ontahi/runtime-nextjs`, and non-visual React integration lives in `@ontahi/react`.

Today core still contains some modules and vocabulary that may need cleaner boundaries later:

1. graph client cache primitives that may move with React integration
2. task abstractions that still need a clearer split from runtime-specific workflow adapters
3. names such as `architecture(...)` that may eventually become more Ontahi-native

The package boundaries are expected to keep moving toward:

1. `@ontahi/core`
2. `@ontahi/supabase`
3. `@ontahi/runtime-nextjs`
4. `@ontahi/react`
5. `@ontahi/runtime-vercel-workflows`

Until the remaining packages exist, docs in this folder should explain which ideas are generic and which examples are still inherited from BookOps.

The current split is:

1. `@ontahi/core` for technology-free computation, graph, runtime, and task abstractions
2. `@ontahi/supabase` for Supabase graph/runtime adapters
3. `@ontahi/runtime-nextjs` for Next.js action transport and `next-safe-action` glue
4. `@ontahi/react` for non-visual React hooks, React Query integration, and operation bridge adapters

## Core Idea

The current model separates two different questions:

1. what kind of computation something is
2. what architectural purpose that computation serves

These are not the same.

For example:

1. a use case can be an `Effect`
2. a repository query can also be an `Effect`
3. a batch import pipeline can be a `Stream`
4. a background indexing process can also be a `Stream`

So `Effect` and `Stream` are not layers.

They are shared computational primitives that can appear in multiple layers.

Layers exist for a different reason:

1. they define responsibility
2. they define which concerns naturally belong around that responsibility
3. they define where a piece of logic sits in the app architecture

The generic architecture therefore looks like:

1. shared primitives such as `Effect` and `Stream`
2. purpose-shaped layers built on top of those primitives
3. runtime adapters that inject telemetry, reporting, rate limits, effectors, and architecture defaults

## Shared Computational Primitives

### `Effect`

Use `Effect` for one execution.

That execution may:

1. depend on context
2. read or mutate external systems
3. fail in typed ways
4. return a value

Examples:

1. create a todo
2. fetch a todo by id
3. persist a comment
4. send an email

The important point is that `Effect` does not imply architectural level.

A repository call and a use case body may both be `Effect`s while living in different layers.

It is also important to distinguish an `Effect` from a pure function.

A pure function means:

1. same input
2. same output
3. no side effects

An `Effect` is different.

An `Effect` describes an execution that may:

1. depend on time
2. depend on runtime context
3. read mutable external state
4. mutate external state
5. fail before producing a value

So although an `Effect` may return a value, that does not mean the value is stable over time.

Examples:

1. `sum(2, 3)` is a pure function and always returns the same result
2. `fetchCurrentUser()` is an effect and may return different results at different times
3. `loadTodoById(id)` is an effect because the persistent state may change over time
4. `Date.now()` is an effect-shaped computation because time itself is part of the result

So the stronger distinction is:

1. a pure function is a deterministic mapping
2. an `Effect` is an executable computation with runtime semantics

Non-determinism is a common reason to model something as an effect, but not the only one.

Even a deterministic computation may still be modeled as an `Effect` if we want it to participate uniformly in:

1. failure handling
2. dependency/context access
3. logging and telemetry
4. sequencing with other effects

### `Stream`

Use `Stream` for many values over time.

That means:

1. incremental production
2. batching
3. bounded concurrency
4. chunked processing
5. collection or draining at the edge

Examples:

1. process imported todos in chunks
2. rebuild a search index over many entities
3. translate many text blocks
4. upload many generated assets

Again, `Stream` is not a layer. It is a runtime primitive shared across layers.

### Tasks And Durable Workflow

Task abstractions are now present in `@ontahi/core`.

They cover the generic language of:

1. task definitions
2. task triggers
3. task run stores
4. in-process task execution
5. task facades exposed through the runtime

Durable workflow is still not fully extracted as a standalone Ontahi runtime tier.

The remaining package boundary is about:

1. waits
2. resumability
3. signals
4. long-lived state transitions
5. schedule-triggered durable runs
6. Vercel Workflow-specific execution

BookOps has a working local workflow integration, but the generic package split should happen after the adapter boundaries are clearer.

## Purpose-Shaped Layers

The current generic mental model can be explained through these layers.

### 1. Model Layer

The model layer holds stable domain concepts and pure domain computations.

It should contain:

1. entity/value shapes
2. pure selectors and transformations
3. domain invariants that do not require external systems

It should not contain:

1. DB access
2. framework adapters
3. telemetry concerns
4. runtime wiring

### 2. Use Case Layer

This is the business-operation layer.

A use case exists to answer:

1. what operation the application offers
2. what business rules gate it
3. what result contract it returns
4. which follow-up effects should happen after success

Use cases are usually authored as `Effect`s and executed through the shared server runtime.

This layer is the main decision boundary.

For richer domains, use cases should usually sit beside the domain boundary they orchestrate rather than in a single large feature file.

That often means folder shapes like:

1. `thread/createThread.ts`
2. `message/replyThread.ts`
3. `invite/acceptInvite.ts`

The use case still owns orchestration, but its neighboring domain modules should absorb:

1. policies
2. lifecycle transitions
3. projections
4. loaders

### 3. Repository Layer

This is the persistence-oriented layer.

Repositories exist to:

1. read and write persistent state
2. map storage rows or records into domain-shaped data
3. isolate query construction and storage-specific details

Repositories can also be written as `Effect`s.

They differ from use cases not because they use a different primitive, but because they serve a different architectural purpose.

Typical extra concerns here might later include:

1. transactions
2. query telemetry
3. retry policies for storage-specific failures

## Domain Module Shape

When a domain area becomes rich enough, we should prefer entity- or policy-oriented folders over one broad feature root.

Typical ingredients are:

1. `audience/` or other access-policy folders
2. entity lifecycle folders such as `thread/`, `message/`, or `invite/`
3. local `*.policy.ts` modules
4. local transition modules returning `drafts + events`
5. projections and loaders kept separate from transitions

The point is not that everything must become an entity.

The point is:

1. keep lifecycle behavior near the thing that changes
2. keep access rules easy to find
3. keep projections out of command logic
4. keep usecases focused on orchestration

### 4. Platform Layer

This layer isolates vendor or infrastructure adapters.

Examples:

1. database clients
2. storage clients
3. email providers
4. AI providers
5. authentication providers

It is the most implementation-specific layer.

The platform layer often looks like “clients to external services”, but the client itself is not the whole story.

This layer may also own concerns such as:

1. usage tracking
2. quota constraints or provider-side limits
3. provider-specific retry and error normalization
4. load balancing or provider selection
5. authentication/session handling for external systems

Some of those concerns may later be shared as more general wrappers around effects, but they often first appear at the platform seam because that is where vendor behavior is visible.

Platform code may also trigger events.

That is a useful reminder that events should be treated as first-class model concepts rather than as incidental transport payloads.

The fact that an external integration caused something to happen in the system is still part of the application model.

For that reason, the long-term direction should treat events more explicitly as modeled facts, not only as runtime messages.

This layer does not have to be modeled in only one dialect.

Both of these can be valid:

1. function-first adapters
2. object/client-shaped adapters

The right choice depends on the external service and the ergonomics we want.

Examples:

1. a small one-shot integration may read best as plain functions
2. a richer provider surface may read better as an object with focused methods

The architectural rule is less about function versus object, and more about keeping provider-specific behavior behind the platform boundary.

### 5. Application Runtime Layer

This is the generic execution seam around authored business logic.

Today it provides:

1. telemetry spans
2. structured reporting
3. rate-limit hooks
4. per-request/use-case context
5. effect intent execution
6. architecture defaults by layer prefix
7. task facade wiring

This is not domain logic.

It is the execution model around domain logic.

## Requirements, Concerns, And Intents

These are not separate business layers. They are runtime shaping tools.

### Requirements

Requirements are preconditions.

They run before the main use case body.

Examples:

1. authenticated user required
2. feature flag enabled
3. tenant membership required

Requirements are not the same thing as boundary schema validation.

Current preferred split:

1. action and route transport inputs use Zod-backed boundary schemas
2. usecase pre/post guarantees use contracts
3. `requires` stay focused on guard-style runtime conditions such as auth, access, and feature switches

### Concerns

Concerns wrap execution.

They are useful when something should surround the operation rather than precede it as a yes/no gate.

Examples:

1. rate limiting
2. transactions
3. maybe tracing enrichment
4. maybe consistent retry wrappers

Some concerns can be layer-specific, and some can be cross-layer.

For example:

1. telemetry is broadly cross-layer
2. transactions fit naturally around repository or persistence-heavy operations
3. rate limiting fits naturally around request-facing use cases

### Intents And Effectors

Use cases may return:

1. plain success data
2. success data plus follow-up intents

Those intents are then executed by effectors configured in the application architecture.

This lets the use case say:

1. what happened
2. what follow-up should occur

without hard-wiring the follow-up implementation inside the use case body itself.

Typical examples:

1. emit a domain event
2. run a follow-up effect
3. optionally attempt a side effect without failing the use case

## Generic Shape In A Todo App

Here is the same model in a simple Todo app.

### Model

The model layer might define:

1. `Todo`
2. `TodoId`
3. `TodoStatus`
4. pure helpers such as `canComplete(todo)` or `renameTodo(todo, title)`

### Use Cases

The use case layer might define:

1. `createTodo`
2. `renameTodo`
3. `completeTodo`
4. `archiveCompletedTodos`

Those are business operations, not transport handlers and not raw DB queries.

### Repositories

The repository layer might define:

1. `fetchTodoById`
2. `insertTodo`
3. `updateTodo`
4. `listCompletedTodos`

These may still be `Effect`s, but they are persistence responsibilities.

### Platform

The platform layer might define:

1. Postgres client adapter
2. email adapter
3. push notification adapter

### Runtime

The runtime would supply:

1. telemetry
2. reporting
3. rate limiting
4. architecture defaults
5. effectors

### Stream Example

Suppose we want to archive all completed todos older than 90 days.

That operation could be modeled as:

1. repository query returns a `Stream` of completed todos
2. the use case groups them in batches
3. repository mutation archives each batch
4. the public API still returns a normal promise/result

The stream is the execution primitive.

The use case is still the business boundary.

### Intent Example

`completeTodo` could:

1. update the todo state
2. return success data
3. emit a `todo_completed` event as a follow-up intent

The use case owns the fact that completion happened.

The effector owns how emitted events are handled.

## Generic Runtime Boundary

The current runtime can be described generically like this:

1. author business logic as an `Effect`
2. execute it through `runServerUseCase(...)` or layer-built helpers
3. let the runtime standardize:
   - success serialization
   - failure serialization
   - telemetry
   - reporting
   - context
   - post-success intent execution

Then the application wires real adapters:

1. tracing implementation
2. error reporting implementation
3. rate-limit implementation
4. architecture defaults
5. effectors

This separation is important:

1. `ontahi/packages/core/` defines the generic engine and the first extracted runtime vocabulary
2. BookOps defines real adapters, domain models, and its app-local architecture facade
3. future Ontahi packages should move technology-specific adapters out of core

## Current Frictions And Boilerplate

This is the most important section.

The current model is coherent, but it still has friction.

### 1. Vocabulary Load

A newcomer has to internalize many ideas at once:

1. `Effect`
2. `Stream`
3. `layer`
4. `usecase`
5. `requirement`
6. `concern`
7. `intent`
8. `effector`
9. architecture defaults

The concepts fit together, but the learning cost is real.

### 2. `effect` Versus `usecase`

This is conceptually correct but still subtle.

Both may be written with the same computation primitive, yet they mean different things architecturally.

That distinction is easier to explain once understood than to discover from code alone.

### 3. Runtime Indirection

The runtime is nicely separated, but understanding the whole picture requires reading several seams together:

1. generic server runtime
2. architecture registry
3. app runtime bootstrap
4. app architecture declaration

This is powerful, but not yet very obvious.

### 4. Intents Are Powerful But Still Under-Explained

`withEffects(...)` and related intent helpers give us a strong separation between:

1. primary business result
2. follow-up execution

But the mental label for this pattern is still not obvious to a reader.

### 5. Streams Need A Stronger House Style

We now have a real stream primitive and shared helpers, but the stylistic rules are still emerging.

Questions still worth tightening:

1. when should a repository return `Stream` versus `Effect<Array<...>>`
2. what helper vocabulary should be standard
3. how much internal DSL is useful before it becomes noise

### 6. Durable Workflow Is Not Fully Extracted Yet

The current model explains:

1. one operation
2. many items in one pipeline
3. generic task definitions and task run stores

But it still does not fully isolate:

1. long-lived orchestration across waits
2. external signals
3. resumable multi-step execution across time
4. Vercel Workflow-specific runtime behavior

That boundary should become a later package rather than being buried in `@ontahi/core`.

### 7. Events Should Become More First-Class

The current model already uses events and effectors, but events do not yet feel fully reified as first-class modeled concepts.

That creates some ambiguity around:

1. which events are domain facts versus runtime messages
2. where event contracts should live
3. how external-provider-triggered events fit into the overall model

The architecture would become clearer if events were treated more explicitly as modeled facts that can be owned by the domain and then transported through different runtime mechanisms.

## Current Short Version

The current generic mental model can be summarized as:

1. `Effect` is the primitive for one execution
2. `Stream` is the primitive for many values over time
3. layers are defined by architectural purpose, not by which primitive they use
4. use cases are business decision boundaries
5. repositories are persistence boundaries
6. platform modules are vendor/infrastructure boundaries
7. platform boundaries may be modeled with functions or client-like objects, as long as vendor-specific behavior stays behind the seam
8. runtime adapters provide telemetry, reporting, rate limiting, context, and effect execution
9. intents/effectors separate successful business decisions from follow-up execution
10. events should become more explicitly modeled as first-class facts
11. task abstractions exist, but durable workflow still needs a cleaner runtime package boundary

This document should be treated as a description of the current shape, not as the final ideal form.

Its job is to help us critique the design, tighten naming, and reduce boilerplate over time.
