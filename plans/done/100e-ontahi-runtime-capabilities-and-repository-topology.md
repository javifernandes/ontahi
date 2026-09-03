# 100e. Ontahi Runtime Capabilities And Repository Topology

Status: done

Canonical ID: `ontahi://plans/100e-ontahi-runtime-capabilities-and-repository-topology`

Migrated from: `bookops://plans/100e-ontahi-runtime-capabilities-and-repository-topology`
Original path: `plans/done/100e-ontahi-runtime-capabilities-and-repository-topology.md`
Source commit: `cb9c038a`

Parent plan: [`100-ontahi-framework-extraction.md`](../done/100-ontahi-framework-extraction.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Follows:

1. [`100c-ontahi-explorer-react-boundary.md`](./100c-ontahi-explorer-react-boundary.md)
2. [`100d-ontahi-vercel-workflow-runtime-boundary.md`](./100d-ontahi-vercel-workflow-runtime-boundary.md)

Related atlas shapes:

1. [`ontahi.runtime-capability-model`](ontahi://atlas/application-architecture-surface/runtime-capabilities)
2. [`ontahi.application-architecture-surface`](ontahi://atlas/application-architecture-surface)
3. [`ontahi.source-code-organization`](ontahi://atlas/source-code-organization)
4. [`ontahi.durable-workflows`](ontahi://atlas/durable-workflows)
5. [`ontahi.independently-usable`](ontahi://atlas/independently-usable)

## Summary

Define Ontahi's runtime capability model and move the current framework packages into an extractable repository topology.

The framework now has credible package boundaries for core, Supabase, Next.js, React, Explorer, and Vercel Workflow. The next design problem is no longer only "which file moves next?" It is which semantic capabilities an Ontahi application configures, which guarantees they require, how adapters implement them, and how framework sources can later leave the BookOps repository cleanly.

A second application remains valuable, but it should validate deliberate adapter axes rather than merely copy BookOps wiring. It is candidate evolution toward the [`Ontahi Independently Usable`](ontahi://atlas/independently-usable) Goal, not part of this plan's closure contract.

## Context

At the start of this plan, Ontahi and BookOps still shared one mostly flat workspace. Framework package names communicated their intended ownership, but their source paths did not yet form an extractable unit. At the same time, the existing runtime surfaces used terms such as runtime, store, service, transport, and adapter without one explicit capability model.

This creates two related pressures:

1. a source move can group the packages without proving that their public configuration surface is complete,
2. a second app can prove portability only after it can choose meaningfully different persistence, transport, and execution adapters.

The immediate work should therefore separate the mechanical topology move from capability design, then use the capability model to order adapter spikes.

## Research / Evidence

The repository already contains several independent seams:

1. the graph runtime separates typed query and command execution from Supabase and in-memory implementations,
2. task execution uses generic task runtime and task-run-store contracts with in-process and Vercel Workflow implementations,
3. rate limiting already separates a generic counter store from the BookOps Redis wiring,
4. Next.js action and internal task-step bridges expose transport pressure that can be compared with a non-Next host,
5. BookOps composes identity, authority, telemetry, reporting, routes, registries, credentials, and application policy around those framework surfaces.

### Durable Execution Candidates

The Ontahi port should describe task semantics independently from the engine. Candidate engines are not equivalent:

| Candidate                                                            | What it provides                                                                                         | Fit for Ontahi                                                                                                  | Current direction                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| In-process core adapter                                              | Same-process execution with injectable sleep/store                                                       | fastest local and test baseline; not crash durable                                                              | keep as the zero-infrastructure adapter                                  |
| Vercel Workflow                                                      | durable workflows integrated with the current deployment host                                            | proven production adapter for BookOps                                                                           | keep technology-specific in `@ontahi/runtime-vercel-workflows`           |
| [DBOS](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) | TypeScript durable workflows, steps, queues, timers, and recovery backed by PostgreSQL                   | strongest first dev-first/open-source spike because it reuses PostgreSQL and runs as a library in ordinary apps | evaluate first                                                           |
| [Restate](https://docs.restate.dev/)                                 | durable execution, journals, timers, service calls, state, and workflows through a self-hostable runtime | strong semantics and a lightweight local story; introduces a distinct runtime service and invocation model      | evaluate second                                                          |
| [Temporal](https://docs.temporal.io/)                                | mature durable workflow platform with TypeScript SDK and self-hosting                                    | valuable compatibility reference; heavier operational and worker model                                          | defer until the port survives lighter adapters                           |
| [pg-boss](https://github.com/timgit/pg-boss)                         | PostgreSQL-backed jobs, retries, schedules, concurrency, and queue delivery                              | good background-job adapter, but not itself a workflow journal/checkpoint engine                                | use only if Ontahi intentionally owns the missing workflow state machine |
| [RabbitMQ](https://www.rabbitmq.com/docs/reliability)                | reliable message delivery with acknowledgements, confirms, queues, and redelivery                        | useful event/job transport; consumers still need idempotency, workflow state, timers, and step recovery         | do not treat as a durable-operation runtime                              |

The first durable-runtime experiment should test the existing Ontahi `TaskRuntimeAdapter`, `TaskRunStore`, steps, progress, durable sleep, failure mapping, and reconciliation contracts. It should not redesign domain tasks around a candidate SDK before identifying a real mismatch.

## Scope

1. Define capability, port, adapter, and host-composition vocabulary.
2. Classify the kinds of state and guarantees Ontahi runtimes use.
3. Define the shared-monorepo topology that can later become the Ontahi repository.
4. Map current implementations and candidate adapters onto semantic capabilities.
5. Move the six current Ontahi packages under `ontahi/packages/*` without changing public package names.
6. Record PostgreSQL, transport, durable execution, coordination, and second-app directions as candidate evolution rather than committed slices.
7. Keep the parent extraction plan and related Atlas items synchronized with this shape.

## Non-Goals

1. No package moves in the shaping commit.
2. No `web -> apps/bookops` move in the same slice as the Ontahi package move.
3. No new example application before independent adapter axes exist.
4. No PostgreSQL driver or ORM decision yet.
5. No commitment to DBOS, Restate, Temporal, pg-boss, RabbitMQ, or another engine before a contract spike.
6. No standalone Ontahi repository or publishing workflow yet.

## Proposed Form

### Repository Topology

Use an extractable Ontahi subtree:

```text
ontahi/
  packages/
    core/
    supabase/
    runtime-nextjs/
    runtime-vercel-workflows/
    react/
    explorer-react/
  examples/                 # added later; examples move with Ontahi

apps/
  bookops/                  # future move of the current web app

packages/                   # future home for BookOps-specific libraries
  model/
  extractor/
  translator/
  cli-core/
  testing/
```

Topology constraints:

1. prefer `ontahi/packages/core` over `lib/ontahi/ontahi-core`; `lib` is ambiguous and repeating `ontahi` in both path and directory name adds noise,
2. keep npm package names such as `@ontahi/core` unchanged,
3. move only the existing Ontahi packages in the first mechanical topology slice,
4. move `web` to `apps/bookops` separately because it affects Vercel roots, scripts, environment loading, and local developer workflows,
5. move BookOps-specific libraries under root `packages/` only after deciding whether their current boundaries remain useful,
6. place framework validation apps under `ontahi/examples/`, not root `apps/`, so they travel with the future Ontahi repository,
7. do not combine source relocation with capability API redesign.

This layout makes the eventual repository extraction a subtree move rather than another conceptual reclassification. It does not require extracting Ontahi into its own repository yet.

### Capability Vocabulary

Use four distinct terms:

1. **Capability**: a semantic service required by framework behavior, such as graph execution, durable tasks, rate limiting, or telemetry.
2. **Port**: the technology-independent contract for that capability, owned by `@ontahi/core` when it is framework-level.
3. **Adapter**: a technology implementation of one or more ports, such as Supabase, PostgreSQL, Redis, DBOS, or Vercel Workflow.
4. **Host composition**: application-owned wiring of adapters, credentials, routes, registries, policy, and domain declarations.

Avoid using `runtime`, `storage`, or `service` as interchangeable umbrella words. A runtime may execute behavior; a store may retain state; a transport may only move invocations.

### State Classes

"Memory systems" is a useful intuition, but Ontahi should name the guarantees explicitly:

| State class                | Purpose                                          | Typical guarantees                                                   | Examples                                                                   |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Authoritative domain state | Source of truth for entities and relations       | transactions, constraints, query semantics, migrations               | PostgreSQL, Supabase/PostgREST, in-memory test graph                       |
| Durable execution state    | Resume tasks and workflows after process failure | journal/checkpoints, retries, durable timers, idempotent step replay | Vercel Workflow, DBOS, Restate, Temporal                                   |
| Coordination state         | Coordinate concurrent work                       | counters, leases, locks, deduplication, idempotency keys, TTLs       | Redis, PostgreSQL advisory/table state, in-memory test stores              |
| Derived state              | Accelerate reads or serve projections            | disposable/rebuildable, eviction, eventual consistency               | operation cache, React Query cache, Redis cache, search indexes            |
| Event/log state            | Record and deliver facts over time               | ordering, offsets, replay, delivery semantics                        | transactional outbox, append-only event log, RabbitMQ/NATS/Kafka transport |
| Object state               | Store large opaque values outside the graph      | object identity, streaming, retention, signed access                 | S3-compatible blob storage, Supabase Storage                               |

One technology may implement several state classes, but the framework contracts should not collapse them. PostgreSQL can hold domain data, task journals, coordination rows, and outbox events; those remain different capabilities with different failure semantics.

### Runtime Capability Map

| Capability                      | Framework responsibility                                                   | Current implementation                                                | Candidate adapters or next boundary                                                              |
| ------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Graph data runtime              | Execute typed graph queries and commands against authoritative state       | in-memory core runtime; Supabase adapter                              | direct PostgreSQL adapter with graph, transaction, and reflected-data subpaths                   |
| Durable task execution          | Start, checkpoint, sleep, retry, inspect, and resume tasks                 | in-process adapter; `@ontahi/runtime-vercel-workflows`                | DBOS spike first; Restate comparison; Temporal as mature heavyweight reference                   |
| Task run persistence            | Persist task input, status, progress, result, error, and runtime refs      | in-memory store; Supabase task store                                  | PostgreSQL task store independent from the selected execution engine                             |
| Operation ingress and transport | Carry typed operation/task invocations across process boundaries           | Next.js safe actions, fetch bridge, internal HTTP step bridge         | transport-neutral HTTP envelope/handler plus thin Express adapter                                |
| Identity and authority          | Resolve principals and evaluate framework policy inputs                    | Ontahi authority model plus BookOps/Supabase host wiring              | explicit identity/principal provider boundary; keep application policy local                     |
| Coordination                    | Rate limits, locks, leases, concurrency, idempotency, dedupe               | generic rate-limit port and store-backed adapter; BookOps Redis store | `@ontahi/redis` and `@ontahi/postgres` coordination subpaths                                     |
| Cache and projections           | Cache operation results and materialize disposable read models             | operation cache, graph client cache, React Query, app search          | explicit cache/projection ports only where framework semantics require them                      |
| Events and messaging            | Publish domain facts and connect reliable asynchronous consumers           | effectors and BookOps event handling                                  | transactional outbox first; broker adapters later; RabbitMQ is transport, not workflow execution |
| Telemetry and reporting         | Trace framework execution and report failures without vendor coupling      | core ports; BookOps OpenTelemetry/Sentry composition                  | focused OpenTelemetry and reporting adapters after port audit                                    |
| Object storage                  | Store files and large values referenced by graph entities                  | BookOps/Supabase host behavior                                        | object-store port only when a framework use case proves the contract                             |
| Clock, IDs, and scheduling      | Make time, IDs, timers, and tests deterministic where semantics require it | injected run IDs/sleep in selected runtimes; host clocks elsewhere    | small core ports; durable scheduling remains an execution-engine capability                      |

### Adapter Packaging Direction

Prefer a small number of coherent technology packages over one package per interface:

1. `@ontahi/postgres` may implement graph persistence, task run storage, coordination, and outbox ports through explicit subpaths,
2. `@ontahi/redis` may implement coordination and cache ports,
3. `@ontahi/runtime-dbos` or `@ontahi/runtime-restate` should own execution-engine integration,
4. `@ontahi/runtime-express` may mount transport-neutral HTTP handlers into Express,
5. technology-independent HTTP invocation contracts should live in core or a focused transport package only after Next.js and Express prove a shared protocol,
6. `@ontahi/supabase` remains a broad technology adapter package; it should not define the generic graph/storage semantics.

Package names are directional in this plan. Do not create packages until the corresponding port and one host composition are concrete.

An illustrative future host composition could look like this, without fixing the final factory API:

```ts
const app = createOntahiApplication({
  graph: createPostgresGraphAdapter({ pool }),
  tasks: createDbosTaskRuntime({ databaseUrl }),
  taskRuns: createPostgresTaskRunStore({ pool }),
  transport: createExpressTransport({ app: expressApp }),
  coordination: createRedisCoordination({ client: redis }),
});
```

The important shape is that the host selects adapters by capability. The exact factory names should emerge from the corresponding spikes.

## Execution Slices

### A. Extractable Source Layout

1. Move the six current Ontahi package directories to `ontahi/packages/*`.
2. Update workspace globs, root scripts, lint/format configuration, CI paths, Vercel builds, and lockfile importers.
3. Keep package names and public imports unchanged.
4. Verify all package builds, web typecheck/tests, Workflow discovery, and Vercel production build.
5. Defer `web -> apps/bookops` to a separate branch.

Later adapter and example work is intentionally not an execution slice of this plan. It remains documented under `Closure / Evolution` until one candidate becomes active enough to deserve its own bounded child plan.

## Verification

- [x] Separate capability, port, adapter, and host-composition vocabulary.
- [x] Distinguish authoritative, execution, coordination, derived, event/log, and object state.
- [x] Record an extractable `ontahi/packages/*` and `ontahi/examples/*` topology.
- [x] Keep the BookOps app relocation as a separate mechanical step.
- [x] Compare dev-first durable execution candidates and explain why a broker alone is insufficient.
- [x] Separate candidate evolution from the bounded execution slice.
- [x] Move Ontahi packages into the new subtree and update all path-sensitive tooling.

## Decisions

1. Group framework sources under `ontahi/packages/*` while BookOps and Ontahi share a repository.
2. Keep future framework examples under `ontahi/examples/*` so they move with Ontahi.
3. Move `web` to `apps/bookops` separately from the framework package move.
4. Model runtime variability as capabilities and ports before naming more technology packages.
5. Keep execution state, authoritative data, coordination, derived state, events, and object state semantically distinct even when one database implements several of them.
6. Evaluate DBOS before heavier or more operationally distinct durable runtimes.
7. Delay the second application until it can validate at least two independent adapter axes.

## Open Questions

1. The move revealed path assumptions in pnpm workspace/importers, lint-staged, ESLint/Oxlint/Oxfmt, Jest/Vitest aliases, Tailwind content, CI change detection, coverage uploads, JUnit collection, and maintenance prompts.
2. No new source ownership mismatch was required to complete the move. BookOps host composition remains deliberately outside the subtree and is tracked by the parent extraction plan.

## Closure / Evolution

This plan is complete. The shaping slice established the capability vocabulary, topology decision, and adapter research, and the implementation slice moved all six existing packages under `ontahi/packages/*` without changing their npm package names or public imports.

Completion evidence:

1. pnpm recognizes all 13 workspace projects and records the six framework importers under `ontahi/packages/*`,
2. package, consumer-test, formatting, linting, Tailwind, CI change detection, coverage, and JUnit paths use the new subtree,
3. all 12 package/application builds passed, including Workflow discovery with 9 steps and 1 workflow and the Next.js production build,
4. all six package suites passed with 71 files and 433 tests,
5. BookOps unit tests passed with 183 files and 830 tests,
6. Storybook Chromium tests passed with 64 files and 319 tests,
7. Actionlint accepted the modified CI and nightly-maintenance workflows.

### Candidate Follow-Up Plans

These directions advance the broader Goal but are not acceptance criteria for 100e:

1. **Direct PostgreSQL data adapter:** graph query/command execution, reflected data, and task-run persistence without Supabase/PostgREST assumptions.
2. **Transport-neutral HTTP boundary:** shared invocation envelopes plus a thin non-Next host such as Express.
3. **Dev-first durable runtime:** DBOS against existing task contracts, with Restate as the next semantic comparison when useful.
4. **Coordination adapters:** Redis and PostgreSQL implementations for rate limits, idempotency, locks, or leases only as concrete semantics require them.
5. **Second application validation:** a small `ontahi/examples/*` app after at least two independent adapter axes exist.
6. **Independent repository:** move the prepared subtree only when source boundaries, documentation, examples, publishing, and release ownership are sufficiently honest.

Create one of these as a child plan only when it becomes active and bounded. Until then, the Goal and affected Atlas model items retain the horizon without inflating the current plan.
