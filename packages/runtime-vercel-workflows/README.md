# @ontahi/runtime-vercel-workflows

Vercel Workflow integration for Ontahi durable tasks.

## Public Entry Points

1. `@ontahi/runtime-vercel-workflows/runtime`: creates an Ontahi `TaskRuntime` from host task storage and a workflow resolver.
2. `@ontahi/runtime-vercel-workflows/executor`: runs Ontahi tasks and steps inside a host-owned Vercel Workflow entrypoint.
3. `@ontahi/runtime-vercel-workflows/reconciliation`: maps and reconciles Vercel Workflow run state into Ontahi task snapshots.
4. `@ontahi/runtime-vercel-workflows/codegen`: emits statically discoverable workflow and step entrypoints from an analyzed Ontahi application.

The codegen entrypoint owns runtime-specific rendering but not generated files. Hosts provide output paths, their configured workflow runtime module, and optional task step runners. The runtime package does not own application task definitions, concrete task storage, routes, or step executors.
