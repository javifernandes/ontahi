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
  - ontahi://plans/100-ontahi-framework-extraction
  - ontahi://plans/100g-ontahi-codegen-and-application-tooling-boundary
  - bookops://plans/70-first-class-workflow-tier-in-architecture
  - ontahi://plans/133-nominal-model-registry-and-codegen-reuse
  - ontahi://plans/134-codegen-analysis-organization-and-semantic-coverage
  - ontahi://plans/140-colocated-test-topology
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

Named Operation Values carry their transitive static schema dependencies in that inventory.
Client emission orders shared Value bindings before their consumers and resolves receiver-bound
Entity references without copying host declarations. Nested Values obey the same nominal uniqueness
rule as root Values. An unresolved or cyclic portable schema dependency is a diagnostic, not a
license to emit a partial contract or import server closures.

Inventory is separate from target-specific projection: server-only parsing does not require browser
portability. Operation inputs project the raw wire schema; `graphSchema.transform` callbacks and
executable refinements remain authoritative in the receiving runtime. Analysis records this processing
without copying callbacks. Parsed defaults stay server-side when they cannot describe raw input.
Executable outputs still require an explicit portable output contract, rather than substituting their
pre-transform shape. Optional portable transformations/previews are deferred, not a reason to copy
JavaScript closures or confuse wire input with the parsed value. See the
[release rehearsal decision](../../docs/research/release-readiness-bookops-2026-09.md#decision-input-transformations-stay-at-the-execution-boundary-for-now).

`@ontahi/codegen` owns neutral source loading, configurable import resolution, diagnostics, generic client/task projections, and the reusable generation runner for cached analysis, deterministic writes, drift checks, target selection, and dependency-aware watch. `@ontahi/runtime-vercel-workflows/codegen` owns Vercel-specific static rendering. BookOps owns alias values, target/output configuration, formatting policy, and its configured workflow runtime. The generated domain-operation and HTTP ingress registries were removed because the graph API already exposes the runtime metadata needed for ordinary composition. The former Next Action client target was also removed: graph operations use the generic invocation bridge, and explicitly authored Next Actions can use `@ontahi/runtime-nextjs/actions` without codegen.

Codegen tests follow the repository's colocated topology. Focused suites sit beside the analysis or
emission module they specify; cross-pipeline suites at `src/` use `.integration.test.js`; the shared
semantic generated-module harness sits with those emitters as `.test-support.js`. Both suffixes are
excluded from the source files shipped by `@ontahi/codegen`.
