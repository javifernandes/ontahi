# 100. Ontahi Framework Extraction

Status: done

Canonical ID: `ontahi://plans/100-ontahi-framework-extraction`

Migrated from: `bookops://plans/100-ontahi-framework-extraction`
Original path: `plans/done/100-ontahi-framework-extraction.md`
Source commit: `cb9c038a`

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

> [!NOTE]
> Ontahi is the framework. BookOps is an application built with Ontahi. The first mechanical step should name the existing generic package `@ontahi/core` and place it in `ontahi-core/`, even before the framework is fully extracted from BookOps.

## Summary

BookOps has grown a generic architecture runtime: computation helpers, value helpers, validation atoms, data graph modeling, operation execution, runtime concerns, task abstractions, server/browser bridges, and adapters for technologies such as Supabase and Next.js.

That generic surface should become Ontahi. BookOps should gradually become a host application that configures and consumes Ontahi instead of owning the framework vocabulary directly.

This document coordinates the extraction plan family. Extraction is not the strategic outcome: it is one line of work advancing the Goal that Ontahi becomes independently understandable and usable. Bounded child plans should close as their interventions land; the Goal can continue through portability, examples, documentation, publishing, and adoption work that is not source extraction.

Atlas durable shape: [`Ontahi Source Code Organization`](ontahi://atlas/source-code-organization).

The extraction should happen incrementally:

1. rename the existing `architecture/` package to `ontahi-core/` and publish it internally as `@ontahi/core`,
2. make the public core surface honest by removing accidental technology reexports from the root and generic graph entrypoints,
3. split adapters into focused packages once the boundaries are visible,
4. leave BookOps-specific runtime assembly inside the app until each adapter is generic enough to move.

## Why This Matters

The current package name keeps reinforcing the old mental model: BookOps has "an architecture package". The desired model is stronger:

```txt
Ontahi framework
  -> configured by BookOps
  -> applied to books, editorial workflows, graph operations, tasks, and runtime policies
```

Renaming the package is a small but important pressure change. It makes future diffs, imports, plans, and docs speak in the same direction as the product architecture.

## Strategic Goal

The desired outcome is not only cleaner BookOps package boundaries.

The strategic Goal is [`Ontahi Independently Usable`](ontahi://atlas/independently-usable): promote Ontahi into an open-source framework with its own monorepo, release cadence, examples, developer documentation, and supporting Ontahi books. BookOps should become the first serious host application and proof case, not the permanent owner of the framework code.

That final extraction should happen only after the package seams are stable enough that Ontahi can stand on its own:

1. core package boundaries are honest,
2. technology adapters are separate packages,
3. Ontahi Explorer can be consumed as a reusable UI surface,
4. BookOps imports Ontahi as a framework rather than as local shared code,
5. the Ontahi books and future developer documentation can teach the same concepts that the packages expose.

## Package Direction

The intended package map is:

1. `@ontahi/core`: computation, values, model validation atoms, pure data graph, in-memory graph runtime, operation/runtime primitives, server runtime base, task abstractions.
2. `@ontahi/opentelemetry`: OpenTelemetry implementation of the vendor-neutral server telemetry port; SDK and exporter registration remain host composition.
3. `@ontahi/supabase`: Supabase graph runtime, query/command/materialization adapters, Supabase-backed task run store.
4. `@ontahi/runtime-express`: Express adapter for the transport-neutral operation invocation protocol.
5. `@ontahi/runtime-nextjs`: Next.js and `next-safe-action` transport, action builders, server-action runtime glue, and operation invocation route adapter.
6. `@ontahi/react`: non-visual React hooks, React Query integration, and operation bridge providers.
7. `@ontahi/explorer-react`: Ontahi Explorer UI components and supporting React surfaces for browsing entities, operations, events, tasks, topology, contracts, authority, runtime, resources, schemas, and API reference metadata.
8. `@ontahi/runtime-vercel-workflows`: Vercel Workflow task runtime adapter behind host-supplied registries, stores, and stream writers.
9. `@ontahi/codegen`: build-time analysis and neutral projection tooling for Ontahi application declarations; adapter-specific emitters remain explicit entrypoints of runtime packages.

The package names above are the target shape, not a mandate that they all appear in the first PR.

`@ontahi/react` and `@ontahi/explorer-react` should stay distinct unless the code proves that distinction is artificial. The first package is runtime integration. The second package is product-like Explorer UI.

The next package families should emerge from explicit runtime capabilities rather than another list of technologies. Subplan 100e distinguishes graph persistence, durable execution, task run storage, transport, coordination, caching/projections, events, identity/authority, observability, and object storage before introducing PostgreSQL, Redis, Express, DBOS, Restate, or other adapters.

Codegen is a different axis from runtime capabilities. It evaluates Ontahi declarations into browser-safe, reduced, or statically discoverable artifacts when a target runtime cannot consume the complete application graph directly. It should be extracted only after each generated target proves that ordinary JavaScript reflection or composition is insufficient.

While BookOps and Ontahi share a repository, framework packages should move under `ontahi/packages/*` and future framework examples under `ontahi/examples/*`. Moving `web` to `apps/bookops` is a separate deployment-sensitive change.

## First Slice

Rename the existing workspace package without splitting code yet:

1. [x] Rename `architecture/` to `ontahi-core/`.
2. [x] Rename package `@bookops/architecture` to `@ontahi/core`.
3. [x] Update workspace, root scripts, lint/format globs, CI filters, Vercel build scripts, and package dependencies.
4. [x] Update imports from `@bookops/architecture/*` to `@ontahi/core/*`.
5. [x] Update local test mappers from `../architecture` to `../ontahi-core`.
6. [x] Refresh `pnpm-lock.yaml`.
7. [x] Run focused build/typecheck/test verification for the renamed package and consumers.

This first slice should avoid renaming `web/src/architecture`. That folder is the BookOps application architecture facade and can be renamed only after the framework/package extraction is clearer.

Checkpoint 2026-07-09:
The first slice landed on branch `ontahi-core-extraction`. The package is now `@ontahi/core` in `ontahi-core/`; BookOps still keeps its app-local `web/src/architecture` facade.

Checkpoint 2026-07-09, follow-up branch:
The branch `ontahi-core-surface-supabase` landed through PR 380. It hardened the public core surface, removed Supabase exports from `@ontahi/core/data-graph`, stopped re-exporting `next/actions` from the root `@ontahi/core` entrypoint, and created `@ontahi/supabase` for the Supabase graph adapter plus Supabase task run store.

Checkpoint 2026-07-09, runtime branch:
The branch `ontahi-runtime-nextjs` landed through PR 381. It moved the generic Next.js action runtime from `@ontahi/core` into `@ontahi/runtime-nextjs`, removed the retired hello/task pilot, and kept BookOps imports flowing through local architecture/client facades where possible. The React Query bridge helpers stayed in this package temporarily so the next slice could evaluate a focused `@ontahi/react` split.

Checkpoint 2026-07-10, React runtime branch:
The branch `ontahi-react-runtime` landed through PR 382. It created `@ontahi/react` for non-visual React hooks, React Query integration, and operation bridge adapters. `@ontahi/runtime-nextjs` temporarily kept action metadata, result helpers, and server/action transport glue.

Checkpoint 2026-07-14, actions protocol branch:
The branch `ontahi-core-actions-protocol` landed through PR 393. It moved generic action metadata, query/invalidation helpers, and result helpers into `@ontahi/core/runtime/actions`. `@ontahi/runtime-nextjs` keeps the Next.js/`next-safe-action` server transport and compatibility re-exports; `@ontahi/react` consumes the protocol from core instead of depending on the Next.js runtime.

Checkpoint 2026-07-15, React graph spike:
The branch `ontahi-task-run-ref-spike` moved generic operation bridge hooks into `@ontahi/react/graph`. `TaskRunRef` is consumed from `@ontahi/core/runtime/server`, so durable operation hooks no longer depend on the BookOps app facade. At that checkpoint, `useGraphQuery`, `useGraphCommand`, and `useGraphOperation` remained app-local because they still knew about BookOps browser effect wiring and Supabase runtime options; subplan 100b later resolved this with a host-supplied graph executor boundary.

Checkpoint 2026-07-19, Vercel Workflow runtime boundary:
`@ontahi/runtime-vercel-workflows` now owns the generic Ontahi task adapter, Vercel run reconciliation, and workflow task lifecycle executor. BookOps keeps generated workflow/step directives, task registration, concrete stores, stream writers, routes, and step dispatch as host configuration. The configured executor boundary passed focused tests, Workflow discovery with 9 steps and 1 workflow, and the production Vercel build.

Checkpoint 2026-07-19, extractable package subtree:
The six framework packages now live under `ontahi/packages/*` while retaining their existing `@ontahi/*` names and public imports. Workspace metadata, lockfile importers, local tooling, consumer test aliases, Tailwind scanning, CI change detection, coverage/report collection, Workflow discovery, and production builds all resolve the new topology. Subplan 100e also records the runtime capability model and candidate adapter directions without expanding this slice into new runtime implementations.

Checkpoint 2026-07-19, operation invocation capability:
Subplan 100f established a transport-neutral operation invocation protocol and canonical dispatcher in `@ontahi/core`, added Next.js and Express adapters, routed external HTTP ingress and the BookOps Fetch bridge through the same semantic boundary, and removed the duplicate BookOps operation Server Action. The seventh framework package, `@ontahi/runtime-express`, now proves that operation lookup, validation, authority, execution, and result semantics are portable beyond Next.js.

Checkpoint 2026-07-19, canonical and durable operation results:
Plans 75b and 75c converged application facades, React hooks, transports, and Explorer execution on `OperationInvocationResult`. Synchronous operations now expose canonical success, validation, rejection, domain-failure, and unexpected-error outcomes; durable operations return `TaskRunRef` on acceptance and reflect progress separately from eventual final output. Explorer follows accepted runs through the host task-run loader while preserving the same operation invocation boundary.

Checkpoint 2026-07-21, graph-native durable lifecycle contracts:
Plan 75d made durable progress, final output, step return, and failure schemas first-class graph metadata. Explorer and runtime validation consume the same reflected contracts, so Ontahi no longer describes durable result surfaces through TypeScript-only return types. The remaining duplicate task/workflow descriptor generation belongs to the codegen boundary rather than the operation contract model.

Checkpoint 2026-07-21, first codegen boundary:
`@ontahi/codegen` became the eighth framework package. It owns source loading, configurable import resolution, a serializable application IR, and generic client-entity and task-definition projections, with non-BookOps fixtures. BookOps consumes one analysis for all graph-derived targets while retaining host output orchestration. Generated bridge-operation and HTTP-ingress registries were deleted in favor of direct graph API composition.

Checkpoint 2026-07-21, durable codegen projection:
The application IR resolves task and step ids from graph-native durable declarations. `@ontahi/runtime-vercel-workflows/codegen` emits the host-owned static workflow and step modules, while BookOps supplies only its configured runtime and direct runner. The parallel workflow descriptor and BookOps-local Vercel emitter were deleted; Workflow discovery still sees one workflow with lightweight step entrypoints.

Checkpoint 2026-07-21, Next Action codegen audit:
The only generated Next Action client binding was an unused feature-flags action left from the pre-graph application layer. It and its BookOps-only analyzer, lint guards, and Storybook mocker were deleted instead of extracting an emitter with no demonstrated static requirement. Direct Next Actions remain available through `@ontahi/runtime-nextjs/actions`; graph operations use the generic invocation bridge.

Checkpoint 2026-07-22, observability adapter boundary:
`@ontahi/opentelemetry` now implements the generic core telemetry port with direct OpenTelemetry API integration and `ontahi.*` runtime attributes. Core no longer owns OpenTelemetry or Sentry implementation code; BookOps registers its SDK/exporter and keeps Sentry reporting as host composition. Axiom and SigNoz remain ordinary OTLP destinations.

## Follow-Up Slices

### Extraction Readiness Table

| Area                                    | Current Location                                                                                                                                                                                   | Target                                                                                                                                                                                                              | Readiness   | Decision                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Computation primitives                  | `ontahi/packages/core/src/computation/**`                                                                                                                                                          | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep in core. These are generic and already consumed by extractor, translator, and web.                                                                                                                                                                                                                                                                                                                            |
| Value helpers                           | `ontahi/packages/core/src/value/**`                                                                                                                                                                | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep in core. Avoid growing product-specific helpers here.                                                                                                                                                                                                                                                                                                                                                         |
| Model validation atoms                  | `ontahi/packages/core/src/model/**`                                                                                                                                                                | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep in core. These are generic boundary/schema utilities.                                                                                                                                                                                                                                                                                                                                                         |
| Pure data graph model                   | `ontahi/packages/core/src/data-graph/{authority,binding,command,definitions,execution,operations,planning,query,ref,relation-root,runtime,schema,selection*}.ts`                                   | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep in core. This is the framework center.                                                                                                                                                                                                                                                                                                                                                                        |
| In-memory graph runtime                 | `ontahi/packages/core/src/data-graph/in-memory/**`                                                                                                                                                 | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep in core as the technology-free runtime and test/reference implementation.                                                                                                                                                                                                                                                                                                                                     |
| Graph client cache primitives           | `ontahi/packages/core/src/data-graph/client/**`                                                                                                                                                    | `@ontahi/core` for now                                                                                                                                                                                              | medium      | Keep for now. Revisit after React/Query packages are split.                                                                                                                                                                                                                                                                                                                                                        |
| Supabase graph adapter                  | `ontahi/packages/supabase/src/data-graph/**`                                                                                                                                                       | `@ontahi/supabase`                                                                                                                                                                                                  | high        | Extracted in PR 380. Keep it technology-specific and dependent on `@ontahi/core`, not the other way around.                                                                                                                                                                                                                                                                                                        |
| Supabase reflected entity data reader   | `ontahi/packages/supabase/src/data-graph/reflected-entity-data.ts`                                                                                                                                 | `@ontahi/supabase/data-graph`                                                                                                                                                                                       | high        | Extracted after the Explorer reflected-data spike. Hosts provide reflected entities and a Supabase client factory; the adapter owns search/filter/sort/pagination, column mapping, and missing-column retry behavior.                                                                                                                                                                                              |
| Supabase task run store                 | `ontahi/packages/supabase/src/tasks/**`                                                                                                                                                            | `@ontahi/supabase`                                                                                                                                                                                                  | high        | Extracted with the Supabase graph adapter. It consumes generic task types from `@ontahi/core/runtime/server/tasks`.                                                                                                                                                                                                                                                                                                |
| Generic action protocol                 | `ontahi/packages/core/src/runtime/actions/**`                                                                                                                                                      | `@ontahi/core/runtime/actions`                                                                                                                                                                                      | high        | Keep metadata, query/invalidation helpers, and result normalization in core. It has no Next.js dependency and is shared by Next.js and React packages.                                                                                                                                                                                                                                                             |
| Next.js action runtime                  | `ontahi/packages/runtime-nextjs/src/actions/**`                                                                                                                                                    | `@ontahi/runtime-nextjs`                                                                                                                                                                                            | medium-high | Extracted in PR 381 and narrowed after the React split. Keep Next.js and `next-safe-action` transport concerns here; generic action protocol belongs to core.                                                                                                                                                                                                                                                      |
| Operation invocation                    | `ontahi/packages/core/src/runtime/operation-invocation.ts`, `ontahi/packages/core/src/runtime/server/operation-invocation.ts`                                                                      | `@ontahi/core/runtime/operation-invocation` plus server dispatcher                                                                                                                                                  | high        | Canonical request/result protocol, validation normalization, resolution, authority, and invocation semantics are transport-neutral.                                                                                                                                                                                                                                                                                |
| Express operation transport             | `ontahi/packages/runtime-express/src/operation-invocation/**`                                                                                                                                      | `@ontahi/runtime-express/operation-invocation`                                                                                                                                                                      | high        | Keep Express request/response adaptation here; hosts mount JSON parsing, auth, and observability around the handler.                                                                                                                                                                                                                                                                                               |
| React Query and bridge hooks            | `ontahi/packages/react/src/actions/**`, `ontahi/packages/react/src/graph/**`, BookOps `web/src/data/graph/react.tsx` facade plus `web/src/data/graph/react/context.tsx` and `executor.ts` wrappers | `@ontahi/react/actions` for action hooks and fetch bridge helpers; `@ontahi/react/graph` for graph provider/cache/operation/query/command/reflection hooks; BookOps-local adapters for concrete app graph execution | medium-high | Generic non-visual React integration is split from the Next.js runtime. Provider/cache/operation/query/command hooks, reflected entity data reader support, and reflected operation invoker support live in `@ontahi/react/graph`; BookOps keeps only its provider wrapper, executor adapter, facade aliases, graph entities, operation declarations, runtime defaults, and Supabase runtime option aliases local. |
| Server runtime base                     | `ontahi/packages/core/src/runtime/server/**`                                                                                                                                                       | `@ontahi/core`                                                                                                                                                                                                      | high        | Keep technology-neutral telemetry/reporting ports, no-op adapters, runtime instrumentation, and application configuration in core.                                                                                                                                                                                                                                                                                 |
| OpenTelemetry adapter                   | `ontahi/packages/opentelemetry/src/**`                                                                                                                                                             | `@ontahi/opentelemetry`                                                                                                                                                                                             | high        | Keep span creation, active trace metadata, attribute sanitization, and Ontahi runtime outcome mapping here. Hosts own SDK, resource, processor, and exporter registration.                                                                                                                                                                                                                                         |
| Sentry reporting                        | `web/src/platform/observability/sentry-reporting.ts`                                                                                                                                               | BookOps-local for now                                                                                                                                                                                               | high        | Keep vendor-specific reporting in BookOps until another host proves a reusable framework package.                                                                                                                                                                                                                                                                                                                  |
| Generic task abstractions               | `ontahi/packages/core/src/runtime/server/tasks/**`                                                                                                                                                 | `@ontahi/core`                                                                                                                                                                                                      | medium-high | Keep generic definitions/stores/adapters in core. Do not move BookOps task registration here.                                                                                                                                                                                                                                                                                                                      |
| BookOps app facade                      | `web/src/architecture/**`                                                                                                                                                                          | BookOps-local                                                                                                                                                                                                       | high        | Keep the BookOps composition root local. Catch-all framework re-export shims are removed; plan 68k will reconcile the public meaning of graph, architecture, layer, and concern before broader renaming.                                                                                                                                                                                                           |
| BookOps task orchestration              | `web/src/architecture/runtime/tasks/**`                                                                                                                                                            | BookOps-local for now                                                                                                                                                                                               | low-medium  | Keep local. Generated registries, task names, step routes, and workflow descriptors are app-specific.                                                                                                                                                                                                                                                                                                              |
| Ontahi application analysis and codegen | `ontahi/packages/codegen/src/**` plus remaining orchestration in `web/scripts/generate-ontahi-artifacts.mjs`                                                                                       | `@ontahi/codegen` plus adapter-specific build-time entrypoints                                                                                                                                                      | medium-high | Graph/operation analysis and client/task projections are extracted; BookOps keeps target/file orchestration temporarily; domain-operation, ingress, and unused Next Action generation were removed.                                                                                                                                                                                                                |
| Vercel Workflow adapter                 | `ontahi/packages/runtime-vercel-workflows/src/**` plus thin BookOps composition in `web/src/architecture/runtime/tasks/*vercel*`                                                                   | `@ontahi/runtime-vercel-workflows`                                                                                                                                                                                  | high        | Extracted task adapter, run reconciliation, and task lifecycle executor. BookOps keeps generated workflow/step directives, registries, concrete stores, stream writers, routes, and step dispatch.                                                                                                                                                                                                                 |
| Ontahi Explorer data/admin UI           | `web/src/app/internal/graph/**`, thin adapters in `web/src/components/internal/graph-ops/**`, `ontahi/packages/explorer-react/src/**`                                                              | `@ontahi/explorer-react` plus host adapters                                                                                                                                                                         | high        | Reusable descriptor contracts/builders, schema/detail/browser/execution surfaces, route shapes, navigation, shell, reflected data, and reflected invocation are extracted. Remaining BookOps wrappers supply real host behavior: routes/access, app metadata/registries, task-run loaders, Mermaid, theme/auth composition, and the chapter path/TOC ref-input override.                                           |
| API reference UI                        | `web/src/app/internal/api/**`, `web/src/components/internal/api-reference.tsx`                                                                                                                     | maybe `@ontahi/explorer-react`                                                                                                                                                                                      | low-medium  | Consider with Ontahi Explorer if it can consume generic route metadata.                                                                                                                                                                                                                                                                                                                                            |
| Domain model and operations             | `web/src/features/**`, `web/src/data/graph/{entities,schema,*}.ts`                                                                                                                                 | BookOps-local                                                                                                                                                                                                       | high        | Keep local. These are the application built with Ontahi.                                                                                                                                                                                                                                                                                                                                                           |
| Extractor/translator consumers          | `extractor/**`, `translator/**`                                                                                                                                                                    | BookOps-local consumers                                                                                                                                                                                             | high        | Keep as consumers. They validate that core primitives work outside web.                                                                                                                                                                                                                                                                                                                                            |

### Ordered Work Plan

#### 0. Merge And Rebase Baseline

1. [x] Merge PR 378.
2. [x] Merge PR 380.
3. [x] Merge PR 381.
4. [x] Pull latest `main`.
5. [x] Start the next feature branch from `main`.
6. Keep this plan as the coordination point for every extraction PR.

#### 1. Harden The Public Core Surface

Slice intent: make `@ontahi/core` honest before moving code.

1. audit `ontahi/packages/core/src/index.ts`,
2. audit `ontahi/packages/core/src/data-graph/index.ts`,
3. stop treating `next/actions` as part of the root core surface,
4. stop exposing Supabase adapters through generic data-graph entrypoints,
5. document stable entrypoints versus transitional entrypoints,
6. update BookOps imports where a facade import is more appropriate than a low-level core import.

Status: landed in PR 380.

#### 2. Extract `@ontahi/supabase`

Slice intent: move the clearest technology adapter out of core.

1. create a workspace package for `@ontahi/supabase`,
2. move `data-graph/supabase/**`,
3. move `adapters/supabase/**`,
4. move Supabase task run store tests,
5. move Supabase-only dependencies,
6. update BookOps runtime imports,
7. keep `@ontahi/core` independent from Supabase.

Status: landed in PR 380.

#### 3. Split Next.js Runtime

Slice intent: move action transport and Next.js-specific server/action glue out of core.

1. [x] create `@ontahi/runtime-nextjs`,
2. [x] move `next/actions` transport and server action helpers,
3. [x] update generated action imports,
4. [x] drop the old core exports instead of keeping compatibility shims,
5. [x] make BookOps import this package through its app facade where possible.

Status: landed in PR 381.

#### 4. Split React Runtime Hooks

Slice intent: isolate non-visual React integration from framework core.

1. [x] create `@ontahi/react`,
2. [x] move React Query bridge hooks and providers that are not BookOps-specific,
3. [x] keep BookOps graph entities and operation declarations local,
4. [x] avoid moving GraphOS UI in this step.

Status: landed in PR 382.

#### 4a. Move Generic Action Protocol To Core

Slice intent: make `@ontahi/react` independent from the Next.js runtime.

1. [x] add `@ontahi/core/runtime/actions`,
2. [x] move action metadata, query-key, invalidation, and result helpers into core,
3. [x] keep `@ontahi/runtime-nextjs/actions` as a compatibility re-export,
4. [x] update `@ontahi/react` to consume the protocol from core,
5. [x] remove the package dependency from `@ontahi/react` to `@ontahi/runtime-nextjs`.

Status: landed through PR 393.

#### 4b. Design `@ontahi/react/graph` Provider Surface

Slice intent: design and start the public React graph configuration surface before moving graph hooks.

Use completed subplan [`100a-ontahi-react-graph-provider-spike.md`](../done/100a-ontahi-react-graph-provider-spike.md).

Status: provider/context and generic operation bridge hooks implemented in `@ontahi/react/graph`; BookOps keeps a local wrapper/facade that injects its browser graph runtime and preserves existing app imports.

1. use public entrypoint name `@ontahi/react/graph`, not `@ontahi/react/data-graph`,
2. separate provider/runtime/cache contracts from BookOps defaults,
3. parameterize browser graph runtime creation instead of importing BookOps runtime assembly,
4. keep BookOps graph declarations and host runtime wiring local; move graph query/command hooks only after the executor boundary in 4c,
5. consume `TaskRunRef` from `@ontahi/core/runtime/server` when exposing durable operation hooks,
6. move only hooks that can depend on `@ontahi/core`, `@ontahi/react`, and peer React Query.

#### 4c. Design React Graph Query/Command Boundary

Slice intent: make the next graph hook extraction an API decision, not just a file move.

Use completed subplan [`100b-ontahi-react-graph-query-boundary.md`](../done/100b-ontahi-react-graph-query-boundary.md).

Status: landed through PR 405. The boundary is a Promise-returning graph executor supplied through `@ontahi/react/graph`, while BookOps keeps the adapter from its Effect-based browser runtime and Supabase runtime options.

1. [x] keep React Query hook orchestration in the generic package,
2. [x] keep concrete runtime assembly and effect execution in BookOps or an explicit adapter,
3. [x] keep Supabase option types out of the public React package,
4. [x] move `useGraphQuery`, `useGraphCommand`, and `useGraphOperation` only after the executor contract is tested,
5. [x] preserve existing app imports through BookOps compatibility exports.

#### 5. Extract Ontahi Explorer UI As `@ontahi/explorer-react`

Slice intent: make the graph/operations/admin UI reusable as a framework tool.

Use completed subplan [`100c-ontahi-explorer-react-boundary.md`](../done/100c-ontahi-explorer-react-boundary.md).

Status: landed through PR 413. Ontahi Explorer now owns the reusable reflective UI, descriptors/builders, route shapes, reflected entity browsing, reflected operation execution, and shell/navigation. The remaining BookOps components are host composition or the app-specific chapter path selector rather than extraction debt.

Checkpoint 2026-07-16:
The branch `ontahi-explorer-inventory` created `@ontahi/explorer-react`, added `@ontahi/explorer-react/contracts`, kept BookOps `GraphOps*` types as compatibility aliases, and moved the first display/schema/signature helpers into `@ontahi/explorer-react/components`.

Checkpoint 2026-07-18:
The same extraction branch moved the next reusable Explorer UI cluster: package-owned collapsible sections, JSON editor, theme bridge, schema panel, operation metadata, operation ingress, operation detail panel, task descriptor detail, entity structure, entity operations/tasks panel, entity browser, event detail, the descriptor-only event browser, the overview dashboard, the operation catalog browser, and the tasks browser. `@ontahi/explorer-react` now owns Monaco directly; host integration points are light/dark/system theme configuration, an Explorer mount `basePath`, host-provided entity data panels, host-provided Mermaid rendering, and host-provided task-run refresh/source loaders, while entity/event/task/operation route shapes stay package-owned and BookOps keeps route pages, actions, execution, and data-loading responsibilities.

Checkpoint 2026-07-18, reflected entity data:
The same line of work moved entity data browsing state and UI into `@ontahi/explorer-react` and introduced a generic reflected entity data reader in `@ontahi/core/data-graph` plus `@ontahi/react/graph`. BookOps now supplies a small temporary reader adapter around its existing internal graph entity-data server action. This is intentionally a short bridge until Ontahi can expose metadata and runtime interaction through first-class meta-entities and operations.

Checkpoint 2026-07-18, reflected operation invocation:
The branch introduced reflected operation invocation contracts in `@ontahi/core/data-graph`, added a reflected operation invoker to `@ontahi/react/graph`, and moved the operation execution parser/state helpers into `@ontahi/explorer-react/components`. Dynamic operation execution now runs through `operationId + input` against a host-supplied invoker instead of directly depending on a bridge adapter. BookOps wires the fetch bridge invoker through its provider and keeps the visual execute panel local because it still includes BookOps-specific entity lookup and chapter path helpers.

Checkpoint 2026-07-18, generic entity ref input:
The same branch moved the default reflected entity selector into `@ontahi/explorer-react/components` as `ExplorerEntityRefInput`. It uses `@ontahi/react/graph` reflected entity data hooks and descriptor display metadata to browse and select canonical entity refs. BookOps now reuses the package input for ordinary refs and keeps only the chapter path/TOC picker local, which is the remaining host-specific control until Ontahi can describe richer relation-path selection UX through graph metadata.

Checkpoint 2026-07-18, operation execute panel:
The same branch moved the default operation execute panel/form into `@ontahi/explorer-react/components` as `ExplorerOperationExecutePanel`. The panel owns scalar controls, enum/boolean controls, JSON/expression inspection, destructive confirmation, operation result rendering, and default entity-ref selection. BookOps now keeps only a wrapper that passes theme and injects the chapter path/TOC picker through `renderRefInput` for the one relation-path UX Ontahi cannot yet infer generically.

Checkpoint 2026-07-18, default Explorer operation execution:
The same branch made `ExplorerOperationDetailPanel`, `ExplorerOperationsBrowser`, and `ExplorerEntityOperationsPanel` mount the package-owned execute panel automatically whenever `@ontahi/react/graph` has a reflected operation invoker and the operation descriptor is executable. The old `renderExecutePanel` seam remains as an exceptional full-panel override, but BookOps' normal GraphOps browsers now pass only `renderRefInput` for the chapter path/TOC picker plus theme through `ExplorerProvider`.

Checkpoint 2026-07-18, BookOps ref-input cleanup:
The same branch removed the obsolete BookOps `GraphOpsOperationExecutePanel` wrapper. The remaining BookOps-specific operation execution UI seam is now named for what it actually does: `graph-ops-operation-ref-input.tsx` exports `renderGraphOpsOperationRefInput` for the chapter path/TOC selector. Generic execute-panel tests moved into `@ontahi/explorer-react`; BookOps keeps only host-seam tests around ordinary-ref fallback and the cascaded chapter path picker.

Checkpoint 2026-07-18, Explorer server/reflection extraction:
The branch `ontahi-explorer-server-extraction` added `@ontahi/explorer-react/server` for reusable schema description and generic snapshot/entity/task/operation descriptor building. BookOps `graph-ops-descriptors.ts` is now a host adapter over `BookopsDataGraphApi`, app task definitions, app event metadata, and task-run reconciliation. The branch also moved display metadata normalization into `@ontahi/core/data-graph` and extracted the Supabase-backed reflected entity data reader into `@ontahi/supabase/data-graph`, reducing BookOps reflected data loading to client creation plus route/access wiring.

Checkpoint 2026-07-19, Explorer route and shell extraction:
The same branch added package-owned overview/collection routes, `ExplorerSectionNav`, and `ExplorerShell`. BookOps removed its duplicated section navigation and repeated page frames in favor of one `GraphOpsExplorerShell` adapter that contributes only the Next.js pathname, app theme, Home link, and auth menu; route pages and access control remain application-owned.

Checkpoint 2026-07-19, BookOps Explorer host cleanup:
The same branch mounted `GraphOpsExplorerShell` once in `/internal/graph/layout.tsx`, removed repeated shell composition from the entity/operations/tasks adapters, and made overview/event routes render package components directly. It also removed the dead local entity/operation detail compatibility surface and `graph-ops-types.ts`; BookOps now imports public Ontahi contracts directly and keeps only real host integrations.

1. inventory `web/src/components/internal/graph-ops/**`,
2. separate generic Ontahi Explorer components from BookOps routes/actions,
3. define the data contracts the UI consumes,
4. package the reusable components as `@ontahi/explorer-react`,
5. keep BookOps-specific internal pages as host routes that configure the package.

Likely extraction order:

1. define neutral Explorer descriptor, entity-data, and task-run contracts,
2. scaffold `@ontahi/explorer-react`,
3. extract small display/schema/signature helpers,
4. extract package-owned Explorer widgets such as collapsible sections, JSON editor, theme configuration, schema panels, descriptor-driven detail panels, entity structure, event detail, descriptor-only browsers, entity browser, operation catalog browser, generic entity-ref input, operation execute panel/form, operation execution parser/state helpers, and tasks browser with explicit host seams only for visual execution form extensions, entity data, diagram rendering, and task-run loading,
5. keep concrete entity-data loading, host-specific chapter path controls, and task-run store/source implementations in BookOps until those adapters are framework-level designs,
6. continue reducing BookOps GraphOps wrappers to host composition only.

This is related to the future Ontahi developer documentation and books: Ontahi Explorer should become a visible framework surface, not only a BookOps debug console. GraphOS can remain the conceptual topology vocabulary behind that surface.

#### 6. Evaluate Vercel Workflow Runtime

Slice intent: extract only the generic runtime adapter, not BookOps task orchestration.

Use completed subplan [`100d-ontahi-vercel-workflow-runtime-boundary.md`](../done/100d-ontahi-vercel-workflow-runtime-boundary.md).

Status: landed through stacked PR 414 and final PR 413. `@ontahi/runtime-vercel-workflows` owns the generic task adapter, Vercel run reconciliation, task lifecycle executor, validation, durable sleep, and failure mapping. Generated workflow/step directives, registries, concrete stores, step executors, routes, and stream naming remain BookOps-owned host composition.

1. [x] identify which workflow code is Vercel-specific but generic,
2. [x] identify which code is BookOps task registration or generated descriptors,
3. [x] move generic adapter, reconciliation, and executor contracts after proving the boundary,
4. [x] keep app task registration, task names, internal step route wiring, and workflow descriptors in BookOps.

#### 6a. Shape Runtime Capabilities And Repository Topology

Slice intent: name Ontahi's pluggable runtime axes and create an extractable source subtree before adding more adapters or a second application.

Use completed subplan [`100e-ontahi-runtime-capabilities-and-repository-topology.md`](../done/100e-ontahi-runtime-capabilities-and-repository-topology.md).

Status: complete. The shaping work established `ontahi/packages/*` plus `ontahi/examples/*`, separated capability/port/adapter/host composition, distinguished six state classes, and moved the six current packages into the extractable subtree. Adapter and example-app horizons remain candidate follow-ups.

1. [x] classify existing runtime seams by semantic capability and state guarantees,
2. [x] record the shared-monorepo topology that can later become the Ontahi repository,
3. [x] compare dev-first durable engine directions without treating a broker as a workflow engine,
4. [x] move current Ontahi packages under `ontahi/packages/*`,
5. [x] record PostgreSQL, transport-neutral HTTP, durable runtime, coordination, and second-app directions as candidate evolution rather than one committed mega-plan.

#### 6b. Extract Codegen And Application Tooling

Slice intent: let any Ontahi host generate the boundary artifacts required by its selected runtimes without importing BookOps build scripts.

Use completed subplan [`100g-ontahi-codegen-and-application-tooling-boundary.md`](../done/100g-ontahi-codegen-and-application-tooling-boundary.md).

1. [x] classify every generated target as necessary static projection, adapter-specific output, or removable accidental codegen,
2. [x] define an analyzed application model from Ontahi declarations,
3. [x] extract neutral analysis, rendering, and runner lifecycle into `@ontahi/codegen`,
4. [x] remove unnecessary Next.js generation and place the Vercel-specific emitter behind its runtime package,
5. [x] keep BookOps source paths, aliases, target selection, output paths, and formatting policy as host configuration,
6. [x] derive durable workflow projections from graph-native operation metadata instead of parallel descriptors.

#### 6c. Prove Portability With An Example And Guide

Slice intent: make independent usability executable and teachable before extracting the repository.

Use completed follow-up plan [`100h-ontahi-portability-example-and-developer-guide.md`](../done/100h-ontahi-portability-example-and-developer-guide.md).

1. build one deliberately small non-BookOps application under `ontahi/examples/*`,
2. exercise declarations, runtime composition, operation transport, codegen, and optionally Explorer,
3. default to an infrastructure-light local path,
4. write the developer guide around the runnable example,
5. turn discovered BookOps assumptions into explicit framework or host boundaries.

#### 6d. Extract The Observability Adapter Boundary

Slice intent: keep observability capabilities vendor-neutral while making OpenTelemetry an explicit framework adapter and Sentry a BookOps host integration.

Use completed subplan [`100i-ontahi-observability-adapter-boundary.md`](../done/100i-ontahi-observability-adapter-boundary.md).

#### 6e. Complete The In-Memory Persistence Runtime

Slice intent: make Ontahi's zero-infrastructure graph implementation exercise the same read, command, relation-root, count, and reflected-data surfaces expected from production persistence adapters.

Use completed subplan [`100j-ontahi-in-memory-persistence-runtime.md`](../done/100j-ontahi-in-memory-persistence-runtime.md).

Status: complete. The core in-memory runtime now implements separate infallible read and typed command-error channels, plain and relation-root reads, streams, counts, every graph command operation, returning/cardinality behavior, and reflected Explorer data over one live seeded state.

#### 7. Prepare The Open-Source Ontahi Monorepo

Slice intent: move from internal workspace packages to an open-source framework repository.

Prerequisites:

1. current core, Supabase, Next.js, React, Explorer, and Vercel Workflow packages exist with stable seams,
2. BookOps consumes packages through normal workspace/package imports,
3. framework packages form an extractable `ontahi/` subtree,
4. runtime capability ports and adapter responsibilities are documented,
5. framework docs explain core concepts without requiring BookOps domain knowledge,
6. at least one portability example validates non-BookOps composition,
7. license, package publishing, versioning, and release workflow are decided.

Only then should Ontahi move to its own monorepo.

## Example Shape

BookOps should eventually read like:

```ts
import { architecture } from '@ontahi/core/runtime/server';
import { createSupabaseGraphRuntime } from '@ontahi/supabase';
import { createNextActionTransport } from '@ontahi/runtime-nextjs/actions/server';

export const bookopsArchitecture = architecture({
  graph: createSupabaseGraphRuntime(...),
  transport: createNextActionTransport(...),
  layers: bookopsLayers,
});
```

Feature code should continue to prefer BookOps facades:

```ts
import { Book, useOperationQuery } from '@/architecture/client';
```

The framework extraction is successful when application features depend on BookOps facades, BookOps facades depend on Ontahi packages, and Ontahi packages do not depend on BookOps.

## Closure / Evolution

This extraction plan is intentionally finite. It closes when:

1. framework source and required build tooling form an extractable `ontahi/` subtree,
2. no reusable Ontahi analyzer, emitter, runtime, or UI implementation is owned only by BookOps,
3. BookOps is an explicit host that supplies domain declarations, policies, adapters, configuration, and deployment paths,
4. one non-BookOps example composes Ontahi through public package entrypoints,
5. developer documentation can take a new user from declarations to a running operation without relying on BookOps internals.

Additional persistence adapters, durable runtimes, coordination implementations, package publishing, release automation, and the independent repository continue under [`Ontahi Independently Usable`](ontahi://atlas/independently-usable). They do not keep the source-extraction plan open forever.

All five closure conditions are now met. The framework implementation and build tooling live under
the extractable `ontahi/` subtree, BookOps supplies host composition rather than reusable framework
implementations, Todo Express is the independent executable application, and the first Ontahi
developer book teaches the public package model. This closes extraction _inside_ BookOps.

Publishing packages, choosing release/versioning policy, moving Git history, and making BookOps a
registry consumer are a new distribution problem. They continue in
[`129. Ontahi Independent Repository And Release Readiness`](./129-ontahi-independent-repository-and-release-readiness.md).

## Closure

- Status: done
- Closed on: 2026-08-12
- Effective effort: historical multi-slice work; not estimated
- Follow-up:
  - [`129. Ontahi Independent Repository And Release Readiness`](./129-ontahi-independent-repository-and-release-readiness.md)

## Related Plans

1. [`46b-architecture-package-and-cross-package-stream-expansion.md`](bookops://plans/46b-architecture-package-and-cross-package-stream-expansion)
2. [`55-runtime-agnostic-data-graph-and-pluggable-adapters.md`](bookops://plans/55-runtime-agnostic-data-graph-and-pluggable-adapters)
3. [`57-client-runtime-bridge-and-server-dispatch.md`](bookops://plans/57-client-runtime-bridge-and-server-dispatch)
4. [`68-unified-application-architecture-surface.md`](bookops://plans/68-unified-application-architecture-surface)
5. [`68a-architecture-factory-and-app-facade.md`](bookops://plans/68a-architecture-factory-and-app-facade)
6. [`68i-architecture-import-boundaries-and-bootstrap-api.md`](bookops://plans/68i-architecture-import-boundaries-and-bootstrap-api)
7. [`70-first-class-workflow-tier-in-architecture.md`](bookops://plans/70-first-class-workflow-tier-in-architecture)
8. [`77-domain-topology-and-graphos-layers`](ontahi://plans/77-domain-topology-and-graphos-layers)
9. [`79-graph-native-schema-dsl.md`](bookops://plans/79-graph-native-schema-dsl)
10. [`99-semantic-editorial-workflows.md`](bookops://plans/99-semantic-editorial-workflows)
11. [`100a-ontahi-react-graph-provider-spike.md`](../done/100a-ontahi-react-graph-provider-spike.md)
12. [`100b-ontahi-react-graph-query-boundary.md`](../done/100b-ontahi-react-graph-query-boundary.md)
13. [`100c-ontahi-explorer-react-boundary.md`](../done/100c-ontahi-explorer-react-boundary.md)
14. [`100d-ontahi-vercel-workflow-runtime-boundary.md`](../done/100d-ontahi-vercel-workflow-runtime-boundary.md)
15. [`100e-ontahi-runtime-capabilities-and-repository-topology.md`](../done/100e-ontahi-runtime-capabilities-and-repository-topology.md)
16. [`100f-operation-invocation-capability.md`](../done/100f-operation-invocation-capability.md)
17. [`75b-canonical-operation-invocation-results.md`](bookops://plans/75b-canonical-operation-invocation-results)
18. [`75c-durable-operation-result-contracts.md`](bookops://plans/75c-durable-operation-result-contracts)
19. [`75d-graph-native-durable-operation-lifecycle-contracts.md`](bookops://plans/75d-graph-native-durable-operation-lifecycle-contracts)
20. [`100g-ontahi-codegen-and-application-tooling-boundary.md`](../done/100g-ontahi-codegen-and-application-tooling-boundary.md)
21. [`100h-ontahi-portability-example-and-developer-guide.md`](../done/100h-ontahi-portability-example-and-developer-guide.md)
22. [`100i-ontahi-observability-adapter-boundary.md`](../done/100i-ontahi-observability-adapter-boundary.md)
23. [`100j-ontahi-in-memory-persistence-runtime.md`](../done/100j-ontahi-in-memory-persistence-runtime.md)

## Historical Questions And Disposition

1. Direct PostgreSQL became the focused `@ontahi/postgres` adapter in completed plan 121.
2. Next.js and Express now share the transport-neutral Operation Invocation protocol from plan
   100f; host mounting stays adapter-specific.
3. DBOS, Restate, Temporal, and other durable engines remain adapter research under Durable
   Workflows, not source-extraction gates.
4. Coordination primitives remain a future Runtime Capability direction and should be added only
   under concrete application pressure.
5. The developer book is the canonical current vocabulary. Historical package docs may retain old
   names when they explain a past boundary, but must not present them as the recommended API.
6. The timing and mechanics of the independent repository now belong to plan 129 and require
   packed-artifact evidence.
7. Codegen plan 100g removed accidental targets and retained only actual static-boundary
   projections.
8. `@ontahi/codegen` now owns one analyzed application model for client and durable-runtime
   projections; application-specific output orchestration remains host configuration.
