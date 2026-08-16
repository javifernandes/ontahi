---
id: ontahi.source-code-organization.codegen
kind: artifact
title: Ontahi Application Codegen
parent: ontahi.source-code-organization
status: shaping
horizon: now
supports:
  - ontahi.independently-usable
  - ontahi.source-code-organization
relatedPlans:
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/100g-ontahi-codegen-and-application-tooling-boundary
  - bookops://plans/70-first-class-workflow-tier-in-architecture
  - ontahi://plans/133-nominal-model-registry-and-codegen-reuse
migratedFrom: bookops://atlas/source-code-organization/codegen
sourceCommit: 67713696
---

Ontahi Application Codegen is the build-time projection of Ontahi application declarations into artifacts required by browser, server, and durable runtime boundaries.

It is not a second application authoring language. Developers declare entities, operations, tasks, ingress, and schemas in TypeScript/JavaScript using Ontahi's DSL. The codegen pipeline partially evaluates those declarations into a validated application model and emits only the projections that a target runtime cannot obtain through ordinary composition.

```text
application declarations
        -> analyzed model / IR
        -> generic projections
        -> adapter-specific static emitters
        -> host-selected output files
```

The durable boundary is:

1. `@ontahi/codegen` owns neutral source analysis, validation, naming, import resolution, and generic projections,
2. runtime adapter packages own emitters required by their technologies, such as statically discoverable Vercel Workflow exports,
3. host applications own declarations, selected targets, aliases, source paths, output paths, and deployment composition,
4. generated artifacts must justify why runtime reflection or ordinary JavaScript composition is insufficient.

The analyzed application model resolves graph entities, all operations, durable tasks, ingress, source dependencies, task ids, and runtime-safe step ids. Browser-safe client entities remain an explicit reduced projection rather than redefining the complete operation model.

The analyzer also follows opaque `operationGroup(...)` factories and projects registered
schema-only unified entities. Graph-output metadata written against a server entity's `self` and
other semantic entity declarations is rewritten to the corresponding generated browser schemas.
This keeps normalized client identity intact without requiring a shared runtime entity witness or
importing server declaration modules into browser bundles.

Generated client Entity facades preserve the recursive `.view(name, shape)` authoring surface.
Views remain client source and are transported as JSON-safe ASTs; codegen does not inventory or
register them as server application definitions. Entity and Operation-reachable Value declarations
form the nominal server-model inventory.

`@ontahi/codegen` owns neutral source loading, configurable import resolution, diagnostics, generic client/task projections, and the reusable generation runner for cached analysis, deterministic writes, drift checks, target selection, and dependency-aware watch. `@ontahi/runtime-vercel-workflows/codegen` owns Vercel-specific static rendering. BookOps owns alias values, target/output configuration, formatting policy, and its configured workflow runtime. The generated domain-operation and HTTP ingress registries were removed because the graph API already exposes the runtime metadata needed for ordinary composition. The former Next Action client target was also removed: graph operations use the generic invocation bridge, and explicitly authored Next Actions can use `@ontahi/runtime-nextjs/actions` without codegen.
