# 100d. Ontahi Vercel Workflow Runtime Boundary

Status: done

Canonical ID: `ontahi://plans/100d-ontahi-vercel-workflow-runtime-boundary`

Migrated from: `bookops://plans/100d-ontahi-vercel-workflow-runtime-boundary`
Original path: `plans/done/100d-ontahi-vercel-workflow-runtime-boundary.md`
Source commit: `cb9c038a`

Source plan: [`100-ontahi-framework-extraction.md`](../done/100-ontahi-framework-extraction.md)

Follows: [`100c-ontahi-explorer-react-boundary.md`](./100c-ontahi-explorer-react-boundary.md)

Related atlas shapes:

1. [`ontahi.source-code-organization.runtime-vercel-workflows`](ontahi://atlas/source-code-organization/runtime-vercel-workflows)
2. [`ontahi.durable-workflows`](ontahi://atlas/durable-workflows)
3. [`ontahi.source-code-organization`](ontahi://atlas/source-code-organization)

## Summary

Design and incrementally extract the Vercel Workflow technology adapter as `@ontahi/runtime-vercel-workflows`.

The extraction must separate three concerns that currently share the BookOps task runtime directory:

1. generic adaptation between Ontahi task contracts and Vercel Workflow APIs,
2. durable workflow/step execution machinery,
3. BookOps task registration, generated workflow entrypoints, concrete stores, routes, step executors, and telemetry names.

This is not a whole-folder move. The implementation extracts the generic task adapter, Vercel run reconciliation, and workflow task executor while keeping generated directives and host configuration in BookOps.

## Why This Boundary Is Different

Workflow DevKit discovers and transforms functions marked with `'use workflow'` and `'use step'`. Those statically visible entrypoints are part of the host application build, not ordinary runtime callbacks.

For that reason:

1. BookOps keeps generated workflow and step entrypoints,
2. Ontahi owns reusable orchestration and Vercel API adaptation,
3. host configuration must use explicit functions and stores rather than importing BookOps registries from the package,
4. package entrypoints must stay server-only and must not leak into browser or Storybook bundles,
5. every extraction slice must pass the real Workflow discovery/build path, not only TypeScript tests.

## Current Inventory

| Current surface                                                     | Classification                                                                              | Decision                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vercel-workflow-task-adapter.ts`                                   | Generic adapter with hard-coded BookOps workflow resolver and store                         | Extract the implementation. BookOps keeps a thin composition module that supplies `getTaskWorkflow` and `bookopsTaskRunStore`.                               |
| `task-run-reconciliation.ts`                                        | Generic Vercel run/status/result/error reconciliation                                       | Extract completely, including failed-step error enrichment and tests. BookOps imports the package directly.                                                  |
| `vercel-workflow-task-runtime.ts`                                   | Generic task lifecycle mixed with BookOps registry/store/stream imports and step directives | Extract lifecycle execution behind explicit host capabilities. Keep BookOps stream writers and their `'use step'` directives in the host composition module. |
| `app-task-workflows.generated.ts`                                   | Statically discoverable BookOps `'use workflow'` entrypoints and task-to-workflow map       | Keep in BookOps. The package consumes a host `resolveWorkflow(taskId)` function.                                                                             |
| `app-task-steps.generated.ts`                                       | Statically discoverable BookOps `'use step'` entrypoints and generated task step dispatch   | Keep in BookOps. Generated imports may consume package contracts/helpers after the runtime slice.                                                            |
| `vercel-workflow-task-step-direct-runner.ts` and app step executors | BookOps server runtime, graph concerns, and task implementation dispatch                    | Keep in BookOps.                                                                                                                                             |
| HTTP step bridge/client                                             | Next.js/BookOps route and base URL integration around a potentially generic protocol        | Defer. Revisit after the direct workflow runtime boundary is extracted.                                                                                      |
| task run stores and app task registry                               | Concrete application configuration                                                          | Keep in BookOps and inject through package contracts.                                                                                                        |

## First Public Contract

The first package slice should expose:

```ts
type VercelTaskWorkflowInput = {
  taskId: string;
  runId: string;
};

type VercelTaskWorkflow = (input: VercelTaskWorkflowInput) => Promise<unknown>;

type VercelWorkflowTaskRuntimeAdapterOptions = {
  taskRunStore: TaskRunStore;
  resolveWorkflow(taskId: string): VercelTaskWorkflow | undefined;
  createRunId?: () => string;
};

createVercelWorkflowTaskRuntimeAdapter(options): TaskRuntimeAdapter;
reconcileTaskRunSource(source, store): Effect<TaskRunSource, TaskFailure>;
reconcileTaskSnapshot(source, store): Effect<TaskSnapshot, TaskFailure>;
shouldAttemptTaskRunReconciliation(source): boolean;
```

The adapter owns input validation, durable run creation, `workflow/api.start()`, runtime ref attachment, Vercel status mapping, and snapshot reconciliation. It does not own the host workflow registry or task run store instance.

## Workflow Executor Contract

The workflow executor is created from explicit host capabilities:

```ts
createVercelWorkflowTaskExecutor({
  taskRunStore,
  getTaskDefinition,
  writeProgressEvent,
  writeResultEvent,
});
```

The configured factory is compatible with Workflow directive discovery because the generated host workflow and step functions remain the statically visible directive entrypoints. The package executor owns task validation and lifecycle orchestration; BookOps supplies the task registry, durable store, and stream writers. `TaskContext.sleep` delegates to Vercel Workflow's durable `sleep()` API.

Evolution checkpoint 2026-07-21: Plan 100g later moved the technology-specific renderer behind `@ontahi/runtime-vercel-workflows/codegen`. Generated files and directives remain host-owned; the package derives their source from the neutral Ontahi application model and explicit host runtime imports.

## Ownership Decision

`@ontahi/runtime-vercel-workflows` owns:

1. Vercel Workflow task adapter behavior,
2. Vercel run status mapping and reconciliation,
3. generic workflow task input and runner contracts,
4. generic task lifecycle execution after the directive boundary is proven,
5. the `workflow` technology dependency for extracted code.

BookOps owns:

1. generated `'use workflow'` and `'use step'` entrypoints,
2. task and workflow registries,
3. concrete task run stores,
4. task step executors and graph/runtime concerns,
5. internal HTTP routes and access control,
6. BookOps progress stream namespace and event presentation,
7. package configuration/composition.

## Extraction Order

1. Add the package, workspace/build/test/lint/CI wiring, and public adapter/reconciliation entrypoints.
2. Move adapter and reconciliation implementations/tests into the package.
3. Reduce the BookOps adapter module to explicit package configuration and remove reconciliation shims.
4. Verify package tests, web typecheck/unit tests, Workflow directive discovery, and a production Next.js build.
5. Design and extract the workflow task executor without moving generated directives out of BookOps.
6. Evaluate the HTTP step bridge only after the direct executor boundary is stable.

## Acceptance Checklist

- [x] Inventory Vercel Workflow runtime files by framework versus host responsibility.
- [x] Keep generated workflow and step directives application-owned.
- [x] Define the first package contract around an injected task store and workflow resolver.
- [x] Create `@ontahi/runtime-vercel-workflows` with explicit server-only entrypoints.
- [x] Extract Vercel run reconciliation and its tests.
- [x] Extract the task runtime adapter and its tests.
- [x] Extract task lifecycle execution behind explicit host capabilities.
- [x] Keep BookOps adapter and executor composition thin and explicit.
- [x] Add workspace, build, lint, test, CI, coverage, and Vercel build wiring.
- [x] Pass Workflow discovery and production Next.js build verification.
- [x] Prove the configured workflow executor API through Workflow discovery and focused integration tests.

## Out Of Scope For The First Slice

1. No move of generated BookOps workflow or step modules.
2. No move of BookOps task definitions, step executors, stores, or internal routes.
3. No redesign of Ontahi task semantics.
4. No meta-graph representation of tasks or task runs.
5. No standalone Ontahi repository or package publishing yet.
