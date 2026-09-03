# 100g. Ontahi Codegen And Application Tooling Boundary

Status: done

Canonical ID: `ontahi://plans/100g-ontahi-codegen-and-application-tooling-boundary`

Migrated from: `bookops://plans/100g-ontahi-codegen-and-application-tooling-boundary`
Original path: `plans/done/100g-ontahi-codegen-and-application-tooling-boundary.md`
Source commit: `cb9c038a`

Parent plan: [`100. Ontahi Framework Extraction`](./100-ontahi-framework-extraction.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Shapes: [`Ontahi Application Codegen`](ontahi://atlas/source-code-organization/codegen)

## Summary

Extract the framework-owned analysis and generation pipeline currently embedded in BookOps build scripts, while keeping application declarations, output locations, and host composition in BookOps.

The goal is not to generate code wherever ordinary JavaScript would work. The goal is to let Ontahi declarations cross build and runtime boundaries that require static, reduced, or browser-safe artifacts.

## Context

Before this plan, BookOps owned a 1,485-line `web/scripts/generate-actions.mjs` entrypoint and a 1,572-line operation metadata analyzer. The neutral analyzer and reusable generation runner now live in `@ontahi/codegen`, the Vercel Workflow emitter lives with its runtime adapter, and the renamed `web/scripts/generate-ontahi-artifacts.mjs` entrypoint contains only host configuration and formatting policy.

That tooling is framework behavior even though its targets are BookOps files. A second Ontahi application would otherwise need to copy or import BookOps scripts before it could generate its client graph surface or deploy durable operations.

Code generation is justified where JavaScript cannot preserve the desired boundary by itself:

1. browser code cannot import graph declarations that pull in server-only modules, credentials, or Node dependencies,
2. Next.js and Vercel require some directives and exports to be statically discoverable,
3. durable workflow entrypoints need lightweight projections that do not import the complete application graph,
4. generated declarations can preserve type-level names and contracts after reducing a richer runtime model.

This makes the pipeline closer to partial evaluation of an internal Ontahi language than to a string-saving utility. Application authors write normal TypeScript/JavaScript declarations; the tooling analyzes the supported DSL subset and emits projections for runtimes that cannot consume those declarations directly.

## Research / Evidence

The audit covered six target families:

| Current target                   | Boundary pressure                                                                | Initial disposition                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action client binding            | Historical Next.js client/server module boundary                                 | Remove accidental codegen. The sole generated feature-flag binding had no consumers; graph clients use the generic operation bridge, while direct Next Actions can use the runtime API explicitly without generation. |
| Client entities from graph API   | Browser-safe typed projection of server graph declarations                       | Keep as generic Ontahi codegen.                                                                                                                                                                                       |
| Domain operation registry        | Runtime lookup of operations already present in the graph API                    | Prefer replacing with a reusable runtime helper unless static reduction is proven necessary.                                                                                                                          |
| Task definition registry         | Lightweight durable-operation projection without importing the full server graph | Keep as generic Ontahi codegen.                                                                                                                                                                                       |
| HTTP ingress registry            | Runtime lookup plus possible server bundle separation                            | Audit; use ordinary composition if no static host constraint exists.                                                                                                                                                  |
| Task workflow registry and steps | Vercel Workflow static discovery of `'use workflow'` and `'use step'` exports    | Keep as an adapter-specific Vercel emitter.                                                                                                                                                                           |

Implementation checkpoint 2026-07-21:

1. `@ontahi/codegen` now owns filesystem source loading, configurable alias/import resolution, graph application analysis, and the browser-safe client entity and lightweight task-definition projections.
2. `analyzeOntahiApplication(...)` reads each graph entity once and returns a JSON-stable model of graph references, all analyzed operations, client entities, durable tasks, ingress, source dependencies, and structured declaration diagnostics.
3. BookOps consumes that application model for all graph-derived targets while retaining alias values, target/output configuration, and formatting policy.
4. The generated domain-operation registry was removed; BookOps builds its bridge lookup directly from `BookopsDataGraphApi.listBridgeDomainOperations()`.
5. The generated HTTP ingress registry was removed; the host router consumes `BookopsDataGraphApi.listHttpIngress()` directly.
6. The remaining generated targets are client entities, task definitions, and Vercel workflow/step entrypoints.
7. Non-BookOps fixtures prove declaration analysis, alias resolution, JSON serialization, structured diagnostics, and both neutral projections without BookOps imports.
8. The application IR resolves imported task ids and task-step ids while preserving their runtime-safe import references.
9. `@ontahi/runtime-vercel-workflows/codegen` derives static workflow and step entrypoints from durable operation metadata; BookOps supplies only output paths, its configured runtime module, and its direct step runner.
10. The parallel `task-workflow-descriptors.ts` file and its regex analyzer were deleted. Graph analysis is shared by all three graph-derived targets.
11. The Next Action audit found one generated feature-flags binding with no consumers. Its target, source action, BookOps action builder configuration, metadata analyzer, duplicate lint guards, and Storybook action mocker were deleted rather than promoted into an unnecessary framework emitter.
12. The host command is now `generate:ontahi`, backed by `web/scripts/generate-ontahi-artifacts.mjs`; after the durable and action cleanup, the entrypoint fell from 826 to 409 lines.
13. `@ontahi/codegen/runner` now owns shared analysis, output writes, drift checks, `--only`, `--check`, CLI parsing, and dependency-aware watch lifecycle. BookOps injects its three target renderings plus `oxfmt`/ESLint policy, reducing the entrypoint from 409 to 173 lines.

Plan 70's remaining closure condition is now satisfied: graph-native durable operation metadata is the single source for task definitions, workflow coordinators, and runtime-safe step wrappers.

## Scope

1. Classify every existing generated target as required static projection, adapter-specific emitter, or removable accidental codegen.
2. Define a stable analyzed application model, or IR, from Ontahi declarations.
3. Extract neutral analysis, validation, naming, import resolution, and deterministic rendering into a build-time `@ontahi/codegen` package.
4. Place host-specific emitters with their runtime adapters, especially Next.js and Vercel Workflow emitters.
5. Keep BookOps source declarations, target selection, import aliases, and output paths in BookOps configuration.
6. Derive durable task/workflow projections from graph-native durable operation metadata rather than a parallel descriptor list.
7. Add package-level fixtures that prove the pipeline without importing BookOps application modules.

## Non-Goals

1. Designing a general-purpose programming language, compiler plugin system, or arbitrary AST transform framework.
2. Generating runtime registries that ordinary JavaScript composition can create safely.
3. Moving BookOps entities, operations, task implementations, or routes into Ontahi packages.
4. Building the non-BookOps example application in this plan.
5. Publishing packages or moving Ontahi to its own repository.
6. Replacing the graph-native schema DSL or rewriting all analysis around the TypeScript compiler in the first slice.

## Proposed Form

```text
Ontahi application declarations
  graph API, entities, operations, tasks, ingress
                    |
                    v
       @ontahi/codegen analysis
       validated application model / IR
                    |
          +---------+----------+
          |                    |
          v                    v
 generic projections     adapter emitters
 client graph surface    Next.js static exports
 task registry           Vercel workflow/steps
          |                    |
          +---------+----------+
                    v
          host-selected output files
```

Illustrative host configuration:

```ts
import { analyzeOntahiApplication } from '@ontahi/codegen';
import { createFileSystemSourceLoader } from '@ontahi/codegen/source-loader';
import { renderVercelWorkflowModules } from '@ontahi/runtime-vercel-workflows/codegen';

const application = analyzeOntahiApplication({
  graphApiPath: './src/data/graph/api.ts',
  sourceLoader: createFileSystemSourceLoader({
    rootDir: process.cwd(),
    aliases: { '@': './src' },
  }),
});

const modules = renderVercelWorkflowModules({
  application,
  runtimeImportPath: './workflow-runtime',
  stepsImportPath: './steps.generated',
  stepRunnerImport: {
    importPath: './host-step-runner',
    importedIdentifier: 'runHostTaskStep',
  },
});
```

The exact API may change during implementation. The important boundary is that Ontahi owns declaration semantics and emitters, while the host owns its application sources and filesystem layout.

## Execution Slices

### Slice 1: Classify And Delete

- [x] Document why each current target requires generation.
- [x] Replace domain operation and ingress registries with runtime composition where static generation has no demonstrated value.
- [x] Preserve generated output behavior for targets that cross real static or bundle boundaries.

### Slice 2: Analyzed Application Model

- [x] Separate source loading and metadata analysis from BookOps target definitions.
- [x] Define a serializable, validated IR for entities, operations, tasks, ingress, imports, and runtime-safe step references.
- [x] Make diagnostics identify the Ontahi declaration and violated constraint rather than generator internals.

### Slice 3: Neutral Codegen Package

- [x] Create `ontahi/packages/codegen` as build-time `@ontahi/codegen`.
- [x] Move reusable analyzer, naming, import, and rendering behavior out of `web/scripts`.
- [x] Add deterministic fixtures and package tests with a non-BookOps graph.
- [x] Keep runtime packages independent from the codegen package unless they expose an explicit build-time entrypoint.

### Slice 4: Runtime-Specific Emitters

- [x] Audit Next.js-specific generation and remove it after its static requirement did not survive Slice 1.
- [x] Move Vercel Workflow coordinator and step emission behind `@ontahi/runtime-vercel-workflows/codegen`.
- [x] Generate durable workflow descriptors from graph-native durable operation metadata.
- [x] Keep `'use workflow'` and `'use step'` statically visible in emitted host files.

### Slice 5: BookOps Host Migration

- [x] Replace `web/scripts/generate-ontahi-artifacts.mjs` implementation with a thin BookOps configuration/CLI entrypoint.
- [x] Keep generated file locations and public BookOps behavior stable during migration.
- [x] Remove the parallel hand-authored task workflow descriptor when graph metadata is sufficient.
- [x] Update build, CI, watch, and Vercel discovery commands to use package-owned tooling.

## Verification

- [x] Existing generated files remain semantically equivalent or intentional diffs are reviewed target by target.
- [x] Repeated generation is deterministic and produces no artifact drift.
- [x] A package fixture generates client and task-definition projections without importing BookOps.
- [x] BookOps local generation, unit tests, typechecks, Workflow discovery, and production build pass.
- [x] Generated browser modules do not import server-only code.
- [x] Generated Workflow modules remain lightweight and statically discoverable by Vercel.
- [x] No reusable analyzer or emitter implementation remains under `web/scripts`.
- [x] Removed generation targets are covered by runtime lookup and ingress tests.

## Decisions

1. Codegen is a build-time capability, not part of the Ontahi application runtime.
2. Ontahi declarations remain TypeScript/JavaScript; the IR is an implementation boundary, not a second authoring format.
3. Generic analysis belongs in `@ontahi/codegen`; technology constraints belong in adapter-specific codegen entrypoints.
4. Host configuration owns source paths, aliases, enabled targets, and output paths.
5. Every generated artifact must justify why runtime reflection or composition is insufficient.
6. One application IR serves every projection; `clientEntities` is an explicit reduced view and never redefines the meaning of all graph operations.
7. Source loading is injected. The package provides a filesystem implementation, while tests and future hosts may provide another loader.
8. Runtime packages own technology-specific rendering, while applications continue to own the generated files and statically discovered directives.
9. Workflow export names are derived deterministically from task and step ids; hosts configure execution wiring rather than repeating semantic ids.
10. Next.js Server Actions remain an optional runtime transport, not an Ontahi codegen target. Graph operations cross the client boundary through the generic invocation bridge, and explicitly authored actions can attach runtime metadata directly when needed.
11. `@ontahi/codegen` exposes a programmatic runner rather than imposing a framework binary or config-file format. Each host can expose that runner through its ordinary package scripts while retaining its filesystem layout and formatter policy.

## Open Questions

1. Should semantic fields such as operation `layer` become part of the analyzed IR when current projections do not preserve them?

## Closure / Evolution

This plan closes when a non-BookOps fixture can analyze Ontahi declarations and emit the required boundary artifacts, BookOps consumes that package-owned tooling through host configuration, accidental codegen is removed, and adapter-specific static outputs are owned by their adapters.

Closure checkpoint 2026-07-21:

All closure conditions are satisfied. Non-BookOps fixtures cover analysis, neutral projections, runner lifecycle, diagnostics, drift, target selection, and command formatting. BookOps is a 173-line host entrypoint over package-owned tooling; accidental registries and Next Action generation are gone, while Vercel-specific rendering lives with its adapter.

The portability proof continued in the completed
[`100h. Ontahi Portability Example And Developer Guide`](./100h-ontahi-portability-example-and-developer-guide.md).
