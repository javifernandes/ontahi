---
id: ontahi.source-code-organization.runtime-vercel-workflows
kind: artifact
title: @ontahi/runtime-vercel-workflows
parent: ontahi.source-code-organization
status: in-progress
horizon: now
supports:
  - ontahi.durable-workflows
relatedPlans:
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/100d-ontahi-vercel-workflow-runtime-boundary
migratedFrom: bookops://atlas/source-code-organization/runtime-vercel-workflows
sourceCommit: 67713696
---

`@ontahi/runtime-vercel-workflows` is the Vercel Workflow technology adapter for Ontahi durable tasks.

The package owns reusable adaptation from Ontahi task contracts to Vercel Workflow start, status, result, error, and durable execution APIs. It must depend on host-supplied task definitions, workflow resolution, and task run stores rather than importing BookOps registries or concrete runtime instances.

BookOps remains the host that owns statically discoverable `'use workflow'` and `'use step'` entrypoints, generated workflow/step registries, concrete task stores, task step executors, internal routes, and application progress stream naming.

The package contains the task runtime adapter, Vercel run reconciliation, and generic workflow task executor. BookOps configures the executor with its task registry, durable store, and stream writers; the generated host entrypoints keep Workflow's build-time directives statically visible.
