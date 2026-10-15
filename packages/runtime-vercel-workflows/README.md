# @ontahi/runtime-vercel-workflows

Vercel Workflow integration for Ontahi durable tasks.

## Public Entry Points

1. `@ontahi/runtime-vercel-workflows/runtime`: creates an Ontahi `TaskRuntime` from host task storage and a workflow resolver.
2. `@ontahi/runtime-vercel-workflows/executor`: runs Ontahi tasks and steps inside a host-owned Vercel Workflow entrypoint.
3. `@ontahi/runtime-vercel-workflows/reconciliation`: maps and reconciles Vercel Workflow run state into Ontahi task snapshots.
4. `@ontahi/runtime-vercel-workflows/codegen`: emits statically discoverable workflow and step entrypoints from an analyzed Ontahi application.

The codegen entrypoint owns runtime-specific rendering but not generated files. Hosts provide output paths, their configured workflow runtime module, and optional task step runners. The runtime package does not own application task definitions, concrete task storage, routes, or step executors.

## Interaction resumption

Explicit Task executions can suspend on Ontahi choice, input, and approval Interactions. The executor
registers an adapter-private Vercel Workflow hook before it publishes the canonical `waiting` Task
checkpoint. `TaskRuntime.respondToInteraction` then authorizes and validates the response, atomically
claims that checkpoint in Task Storage, and resumes the same workflow run through the native hook.

This mapping keeps Ontahi Task Run ids distinct from Vercel workflow run ids, preserves approval
proposals in the canonical checkpoint, and ensures concurrent responses can resume only the atomic
claim winner. Hook tokens and Vercel payload mechanics are not part of the public Interaction model.
Hosts must provide Task Storage with `claimInteraction` support.
Graph-backed executions also provide `createExecutionContext`, allowing each workflow task or step
invocation to rehydrate the application resources used by the unchanged domain definition.

Legacy imperative `context.interact.*` calls remain explicitly unavailable in this runtime. Durable
Event waits are a separate provider capability and are not implemented by this interaction mapping.
