# @ontahi/runtime-vercel-workflows

Vercel Workflow integration for Ontahi durable tasks.

## Public Entry Points

1. `@ontahi/runtime-vercel-workflows/adapter`: creates an Ontahi `TaskRuntimeAdapter` from a host task run store and workflow resolver.
2. `@ontahi/runtime-vercel-workflows/executor`: runs Ontahi tasks and steps inside a host-owned Vercel Workflow entrypoint.
3. `@ontahi/runtime-vercel-workflows/reconciliation`: maps and reconciles Vercel Workflow run state into Ontahi task snapshots.

The package does not own application task definitions, generated `'use workflow'` or `'use step'` entrypoints, concrete task run stores, routes, or step executors. Hosts such as BookOps provide those capabilities explicitly.
