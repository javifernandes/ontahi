---
id: ontahi.source-code-organization
kind: system-primitive
title: Ontahi Source Code Organization
parent: ontahi
status: in-progress
horizon: now
supports:
  - ontahi
relatedPlans:
  - ontahi://plans/100-ontahi-framework-extraction
  - ontahi://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - ontahi://plans/100f-operation-invocation-capability
  - ontahi://plans/100g-ontahi-codegen-and-application-tooling-boundary
  - ontahi://plans/100h-ontahi-portability-example-and-developer-guide
  - ontahi://plans/100i-ontahi-observability-adapter-boundary
  - ontahi://plans/129-ontahi-independent-repository-and-release-readiness
  - ontahi://plans/134-codegen-analysis-organization-and-semantic-coverage
  - ontahi://plans/140-colocated-test-topology
  - ontahi://plans/141-data-graph-progressive-module-boundaries
migratedFrom: bookops://atlas/source-code-organization
sourceCommit: 67713696
---

Ontahi Source Code Organization is the durable package and repository shape produced by the Ontahi
framework extraction line.

It tracks how the former BookOps-local architecture became independently versioned framework
packages, adapters, runtime integrations, UI surfaces, documentation, and an open-source monorepo.

This is intentionally not the same thing as the extraction plan. The plan is the temporal work item. This item is the lasting source organization that remains after individual PRs and plans close.

## Current Package Shapes

1. [`@ontahi/react`](./source-code-organization/react.md)
2. [`@ontahi/explorer-react`](./source-code-organization/explorer-react.md)
3. [`@ontahi/runtime-vercel-workflows`](./source-code-organization/runtime-vercel-workflows.md)
4. [`Ontahi Application Codegen`](./source-code-organization/codegen.md)
5. [`Independent Distribution`](./source-code-organization/independent-distribution.md)
6. [`Ontahí Devtools`](./source-code-organization/devtools.md)

## Package Direction

1. `@ontahi/core`: framework core, data graph primitives, operation/runtime primitives, and shared technology-free runtime building blocks.
2. `@ontahi/opentelemetry`: OpenTelemetry implementation of the core server telemetry port.
3. `@ontahi/supabase`: Supabase graph and task adapters.
4. `@ontahi/runtime-express`: Express transport integration for operation invocation.
5. `@ontahi/runtime-nextjs`: Next.js transport and runtime integration.
6. `@ontahi/react`: non-visual React runtime integration, action hooks, graph provider, and graph context hooks.
7. [`@ontahi/explorer-react`](./source-code-organization/explorer-react.md): reusable Ontahi Explorer React package.
8. [`@ontahi/runtime-vercel-workflows`](./source-code-organization/runtime-vercel-workflows.md): Vercel Workflow task adapter and durable runtime integration, extracted behind host-supplied registries and stores.
9. [`@ontahi/codegen`](./source-code-organization/codegen.md): build-time declaration analysis and generic projections, with technology-specific static emitters exposed by runtime adapter packages.
10. [`Ontahí Devtools`](./source-code-organization/devtools.md): planned browser-resident diagnostics component for semantic Runtime Protocol, Durable lifecycle, client-cache, and transport inspection; its package boundary remains an implementation-plan decision.

## Repository Topology

Ontahi and BookOps now have separate source ownership:

```text
ontahi/                    # public framework repository
  packages/{core,opentelemetry,codegen,supabase,runtime-express,runtime-nextjs,runtime-vercel-workflows,react,explorer-react}
  examples/

bookops/                   # private host application repository
  cli-core, model, testing, extractor, translator, web
  package.json             # exact published @ontahi/* versions
```

BookOps does not carry a framework-source mirror. Ordinary development and CI use published npm
packages; coordinated work may explicitly activate a sibling Ontahi checkout without changing
committed manifests or the lockfile.

## Test Topology

Tests are part of the logical source unit they specify. Focused suites live beside their production
modules; integration suites live at the narrowest source boundary that owns the interaction; shared
test-only modules use a `test-support` suffix beside the group that owns them. Package-level `test/`
trees are not a second architecture.

Package typechecks include this colocated test code. Build configurations, coverage inputs, and
publish manifests exclude test and test-support suffixes explicitly, so discoverability does not
blur the runtime or distribution boundary. When colocation makes a source area visibly crowded,
that is evidence for a separately reviewable module or folder boundary rather than a reason to move
its tests away again.

## Core Data Graph Module Direction

Core Data Graph source uses progressive module boundaries: organize first by architectural role
and then by graph concept within that role. Portable model values must not depend on authoring or
runtime binding; authoring and query/command APIs build on the portable model; runtime contracts
build on the model and semantic ASTs; in-memory execution and external adapter packages implement
those contracts.

The supported `@ontahi/core/data-graph` entrypoint remains the consumer facade. Internal folders
may provide small cohesive entrypoints for source navigation without becoming additional package
entrypoints. Conceptual recursion between Entity, Relation, Ref, and Operation does not by itself
justify runtime module cycles or mixed-responsibility files.

Entity Ref is the first proven boundary: its portable value model, Entity identity
materialization, input authoring, input normalization, and runtime-bound affordances live in
separate colocated modules behind the existing Ref facade. Later Data Graph reorganizations should
preserve behavior and public exports, and should be delivered separately from feature changes.

## Open Source Horizon

The independent monorepo, package-owned build tooling, non-BookOps example, clean package consumer,
provenance-backed release automation, and BookOps registry boundary are established through
`0.1.0-alpha.3`. The remaining horizon is stable-release lifecycle maturity and broader
independent-consumer evidence, not physical extraction.
