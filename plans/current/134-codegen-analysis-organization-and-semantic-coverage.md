# 134. Semantic Codegen Pipeline, Organization, And Coverage

Status: current

Canonical ID: `ontahi://plans/134-codegen-analysis-organization-and-semantic-coverage`

Related plans:

1. [133. Nominal Model Registry And Codegen Reuse](../done/133-nominal-model-registry-and-codegen-reuse.md)
2. [128. Data Graph Execution Bridge](../next/128-ontahi-data-graph-execution-bridge.md)

## Summary

Turn Ontahi codegen into an explicit, semantically tested translation pipeline instead of merely
splitting the current string renderer into smaller files.

The intended pipeline is:

```text
TypeScript source
  -> serializable Ontahi Application IR
  -> Generated Module Model
  -> ephemeral TypeScript AST
  -> deterministic printer
  -> generated TypeScript source
```

The work should first characterize current behavior and improve semantic coverage, then separate
analysis responsibilities, and finally introduce the model-to-model emitter in parallel with the
legacy renderer. It is an isolated maintenance bubble that should land before adding the remote
Data Graph Query/Command bridge.

## Motivation

The current implementation has accumulated analysis, validation, IR construction, dependency
discovery, import inference, naming, and rendering in a few large files. In particular, the
renderer detects dependencies by searching generated text and builds complete modules through
string concatenation. That makes changes hard to reason about and encourages tests to assert the
spelling of generated source rather than its meaning.

Moving functions between files is not enough. The desired architecture should make each phase a
mostly pure translation with explicit input and output models, while keeping filesystem policy and
formatting outside those translations.

## Baseline

Measured on `main` after PR 39 on 2026-08-16:

1. `packages/codegen/src/operation-contracts/metadata-analyzer.mjs`: 2,316 lines.
2. `packages/codegen/src/projections.mjs`: 614 lines.
3. `packages/codegen/test/application-model.test.js`: 1,538 lines.
4. Codegen suite: 47 passing tests across 3 test files.
5. Coverage: 78.11% statements, 71.34% branches, 81.92% functions, and 78.29% lines.
6. `metadata-analyzer.mjs`: 75.85% statements and 72.09% branches.
7. The generated-module test helper uses `ts.transpileModule` and dynamic import. This proves some
   runtime behavior, but `transpileModule` alone is not a full semantic TypeScript check.

Reproduce the baseline with:

```sh
pnpm --filter @ontahi/codegen test:coverage
```

## Architectural Decisions

### Keep two explicit models

The existing Application IR remains the portable, serializable description of the Ontahi
application. It must not contain TypeScript compiler nodes.

Add a separate `GeneratedModuleModel` for output concerns such as imports, local names,
declarations, projected schemas, Values, Operations, and their dependencies. It should be easy to
inspect directly in tests and should not depend on printer formatting.

The Application IR describes what the application means. The Generated Module Model describes
what a generated client module must contain. Neither is generated source text.

### Use the TypeScript Compiler API as the initial emission backend

Ontahi already depends on `typescript` and uses its parser in the analyzer. Prefer `ts.factory`
and the TypeScript printer for the first semantic emitter rather than adding another framework.
Small Ontahi-owned helpers may hide verbose factory calls, but they must not grow into a second
general-purpose TypeScript language model.

Do not make the TypeScript AST canonical. Compiler nodes are ephemeral, version-coupled, and not
JSON-safe. They belong only between the Generated Module Model and the printer.

`ts-morph` remains a valid future option if Ontahi needs rich navigation or mutation of existing
projects. It is not the default for this plan because the present problem is creating new modules
from an already analyzed model.

### Contain opaque source fragments

Some user-authored expressions may not yet have a complete portable Ontahi representation. Do not
pretend these are structured by moving arbitrary strings into a differently named field. Represent
them through one narrow, explicit code-fragment boundary, parse and validate them before emission,
and reduce that boundary incrementally as known Ontahi DSL constructs gain structured models.

### Preserve public behavior

Keep public codegen exports and the serializable Application IR stable. The new emitter should run
in parallel in tests before becoming the default. Do not expose a public legacy/new renderer flag.

Generated output should remain byte-stable while practical. The TypeScript printer may cause a
single intentional formatting drift; if so, review and document it explicitly, update checked-in
artifacts once, and keep semantic parity as the stronger invariant.

## Semantic Test Strategy

Tests should prove three distinct layers:

1. **Model:** analysis and projection produce the expected serializable Application IR and
   Generated Module Model.
2. **TypeScript semantics:** generated modules parse and typecheck with a real `Program` and have no
   unexpected syntactic or semantic diagnostics.
3. **Runtime semantics:** compiled generated modules can be dynamically imported and preserve
   expected values, references, identity, operation contracts, and browser-safe boundaries.

Retain narrow textual assertions only when text itself is the contract, including exact import and
export boundaries, forbidden server imports, deterministic ordering, and intentional formatting.
Prefer structural or semantic assertions everywhere else.

Coverage is a guardrail, not the objective. Add thresholds gradually after covering important
branches; do not chase 100% through low-value assertions.

## Delivery Slices

### Slice 1. Characterization And Semantic Harness

1. Add missing characterization around named-definition discovery, duplicate diagnostics,
   transitive Entity/Value dependencies, Operation inputs and outputs, aliases, and invalid source.
2. Upgrade the generated-module harness to perform real syntactic and semantic TypeScript checks in
   addition to runtime import.
3. Replace brittle text assertions where an equivalent model, type, identity, or runtime assertion
   is available.
4. Introduce conservative coverage thresholds based on the improved baseline.
5. Do not reorganize production code substantially in this slice.

#### First TDD cut

Keep the first change test-only and limited to the generated-module harness plus one realistic
characterization fixture:

1. Add a focused helper regression proving that a generated module with valid JavaScript syntax but
   an invalid TypeScript assignment is rejected. This test must fail with the current
   `ts.transpileModule`-only harness.
2. Replace the helper's check-only transpilation step with a real temporary-file `ts.Program` using
   the package's NodeNext-compatible compiler settings. Collect syntactic and semantic diagnostics,
   format them with file and location context, and fail before dynamic import when diagnostics are
   present.
3. Keep the existing transpile-and-import path as the runtime proof; successful typechecking must
   not replace execution.
4. Extend the existing generated client-entity fixture so one Operation has a named Value input and
   a named Value output whose fields reach an Entity transitively. Assert the analyzed named
   definitions, the generated module's clean TypeScript diagnostics, and runtime schema/reference
   identity without asserting schema source substrings.
5. Run the focused helper and client-entity tests red then green, followed by the full codegen test,
   coverage, typecheck, lint, and build commands. Record the improved coverage before choosing any
   threshold; threshold configuration is a subsequent Slice 1 cut.

Stop this cut before changing `packages/codegen/src/`. Named-definition discovery edge cases,
duplicate diagnostics, aliases, and invalid application source remain separate characterization
cuts so a failure identifies one semantic boundary rather than a broad fixture.

First-cut result on 2026-08-16:

1. The regression failed under `ts.transpileModule` and now passes through a real NodeNext
   `ts.Program` before the existing runtime import.
2. The generated client-entity fixture covers named Value input and output contracts with
   transitive Entity references and asserts both model inventory and runtime identity.
3. No production file under `packages/codegen/src/` changed.
4. The suite increased from 47 to 48 tests. Production coverage remained at the baseline of 78.11%
   statements, 71.34% branches, 81.92% functions, and 78.29% lines, as expected for a harness and
   characterization-only cut. Coverage thresholds remain deferred until a later Slice 1 cut raises
   meaningful production coverage.

Second characterization cut result on 2026-08-16:

1. Invalid TypeScript in both the graph composition root and an imported Entity module now produces
   a location-bearing diagnostic before analysis can consume TypeScript's recovered AST.
2. Duplicate nominal Value coverage now fixes diagnostic ordering, both declaration origins, and
   the existing first-declaration-wins inventory behavior.
3. The production change is limited to parse-diagnostic guards at the two existing analyzer
   boundaries; no analysis responsibility moved.
4. The suite increased to 50 tests. Coverage rose to 78.63% statements, 71.63% branches, 83.20%
   functions, and 78.75% lines. This is the baseline for choosing the first conservative thresholds.

Third characterization cut result on 2026-08-16:

1. Focused source-loader coverage proves that normalized overlapping aliases choose the longest
   matching alias, including relative alias targets.
2. Codegen coverage now enforces conservative global floors of 78% statements, 71% branches, 82%
   functions, and 78% lines.
3. The suite increased to 51 tests and demonstrates 78.69% statements, 71.69% branches, 83.58%
   functions, and 78.82% lines.
4. The remaining Slice 1 work is a narrow audit of generated-source assertions. Retain import,
   export, ordering, and formatting assertions; replace only assertions whose contract is already
   better represented by model, typecheck, or runtime behavior.

Slice 1 closure on 2026-08-16:

1. The generated fallback input contract moved from positive and negative source substrings to a
   runtime assertion against the imported generated module.
2. The remaining source assertions cover module boundaries, deterministic declaration order, or
   focused legacy-renderer transformations. Keep those until the Generated Module Model provides a
   structural assertion boundary in Slice 3.
3. All 51 tests pass with real generated-module typechecking and runtime import. Coverage remains
   78.69% statements, 71.69% branches, 83.58% functions, and 78.82% lines, above the enforced floors.
4. Slice 1 is complete. Slice 2 may reorganize analysis behind the existing compatibility facade,
   beginning with named-definition discovery and symbol/import resolution.

### Slice 2. Analysis Pipeline

1. Extract named-definition discovery and symbol/import resolution from
   `metadata-analyzer.mjs`.
2. Separate validation and diagnostics from discovery.
3. Separate analyzed Application IR construction from both discovery and rendering.
4. Prefer pure functions returning values and diagnostics over shared mutable accumulators.
5. Keep `metadata-analyzer.mjs` as a compatibility facade while internals move into focused
   modules.

Possible internal boundaries include discovery, resolution, validation, graph-output analysis,
operation analysis, and Application IR assembly. Let behavior and dependency direction determine
the final folders rather than imposing one file per concept mechanically.

First analysis-pipeline cut result on 2026-08-16:

1. Named-import inventory, `const` declaration inventory, schema-context construction, and cached
   imported-context resolution now live in `operation-contracts/source-resolution.mjs`.
2. `metadata-analyzer.mjs` remains the public compatibility facade and consumes the internal module
   in one direction. Parsing and diagnostic policy intentionally remain outside the resolution
   module for a later validation boundary.
3. All 51 tests pass with byte- and behavior-compatible output. Global coverage is unchanged at
   78.69% statements, 71.69% branches, 83.58% functions, and 78.82% lines; the extracted resolution
   module has 92.50% statement and line coverage, 77.41% branch coverage, and 100% function coverage.

Second analysis-pipeline cut result on 2026-08-16:

1. Graph composition-root discovery now lives in `operation-contracts/graph-discovery.mjs` as a pure
   translation from a validated TypeScript `SourceFile` to a definition plus diagnostics.
2. The public `analyzeGraphApiModule` facade remains responsible for parsing and rejecting invalid
   syntax before delegating discovery.
3. All 51 tests pass across graph objects, arrays, application overloads, entity factories, and
   transitional registries. Global coverage is 78.76% statements, 71.72% branches, 83.77% functions,
   and 78.89% lines; graph discovery has 82.53% statement, 83.54% branch, 100% function, and 83.87%
   line coverage.

Third analysis-pipeline cut result on 2026-08-16:

1. TypeScript `SourceFile` creation and location-bearing parse diagnostics now live in
   `operation-contracts/source-parsing.mjs`.
2. Graph and Entity facades consume an explicit `{ sourceFile, diagnostics }` result and reject
   syntax before discovery. Imported schema resolution reuses the same parser while preserving its
   existing recovery behavior until validation policy for transitive sources is designed explicitly.
3. All 51 tests pass. Global coverage is 78.78% statements, 71.74% branches, 83.83% functions, and
   78.90% lines; source parsing has 91.66% statement and line coverage, 75% branch coverage, and 100%
   function coverage.

Fourth analysis-pipeline cut result on 2026-08-16:

1. Entity/Value nominal inventory, origin deduplication, and name-conflict validation now live in
   `application-model/named-definitions.mjs` as a pure translation over analyzed entities.
2. `application-analysis.mjs` remains the filesystem and orchestration boundary and merges the
   returned definitions and diagnostics into the serializable Application IR.
3. Reuse, Value/Value conflicts, and Entity/Value conflicts remain byte-compatible across all 51
   passing tests. Global coverage remains 78.78% statements, 71.74% branches, 83.83% functions, and
   78.90% lines; the extracted nominal module has 100% statement, function, and line coverage.

Fifth analysis-pipeline cut result on 2026-08-16:

1. Entity/Relation declaration discovery now lives in `operation-contracts/entity-discovery.mjs`,
   including wrapper, module binder, local factory, transitional registry, and `Object.assign`
   resolution.
2. Discovery now returns `{ initializer, declarations }` explicitly, replacing the analyzer's
   shared `WeakMap` used to recover factory-local declaration scope.
3. Schema projection and Operation analysis remain in `metadata-analyzer.mjs`; the new boundary only
   locates and classifies the effective declaration.
4. All 51 tests pass. Global coverage is 78.81% statements, 71.67% branches, 83.77% functions, and
   79.22% lines; Entity discovery has 82.75% statement, 75.69% branch, 100% function, and 87.80% line
   coverage.

Sixth analysis-pipeline cut result on 2026-08-16:

1. Entity schema projection now lives in `operation-contracts/entity-schema-projection.mjs`,
   including transitive config resolution, fields, reference fields, relations, display, freshness,
   locators, and identity metadata.
2. Shared object-property readers and expression unwrapping moved to the narrow
   `operation-contracts/typescript-ast.mjs` utility boundary used by discovery, projection, and the
   compatibility facade.
3. Operation parsing and graph-output derivation remain in `metadata-analyzer.mjs` for subsequent
   cuts. All 51 tests pass with global coverage of 78.80% statements, 71.62% branches, 83.71%
   functions, and 79.37% lines. Entity schema projection has 90.12% statement, 83.08% branch, 100%
   function, and 95.77% line coverage.

Seventh analysis-pipeline cut result on 2026-08-16:

1. Recursive graph-output derivation now lives in
   `operation-contracts/graph-output-analysis.mjs`, including schema helper classification,
   imported and lazy schema traversal, union field merging, Entity/View descriptors, and client
   graph-output normalization.
2. `metadata-analyzer.mjs` remains the Operation compatibility facade and supplies the resolved
   schema context to the extracted analysis boundary. Operation discovery, diagnostics, and helper
   declaration collection remain together for the next cut.
3. The facade decreased from 1,596 to 1,280 lines while retaining all 51 passing tests. Global
   coverage is 79.15% statements, 71.62% branches, 83.71% functions, and 80.19% lines; the new
   graph-output analysis module has 56.34% statement, 47.36% branch, 60% function, and 59.45% line
   coverage. These lower local numbers make the uncharacterized graph-output variants explicit for
   a later focused semantic-coverage cut without weakening the enforced global floors.

Eighth analysis-pipeline cut result on 2026-08-16:

1. Operation call and collection resolution now live in
   `operation-contracts/operation-discovery.mjs`, covering direct declarations, aliases, factory
   functions, `operationGroup(...)`, expression wrappers, and cycle-safe local resolution.
2. `metadata-analyzer.mjs` remains responsible for translating resolved Operation declarations
   into contracts and diagnostics. This keeps the discovery cut independent from the larger
   durable, ingress, schema, bridge, and cache analysis boundary planned next.
3. The facade decreased from 1,280 to 1,184 lines and all 51 tests pass. Global coverage is unchanged
   at 79.15% statements, 71.62% branches, 83.71% functions, and 80.19% lines; Operation discovery
   has 66.03% statement, 65.21% branch, 71.42% function, and 68.62% line coverage.

Ninth analysis-pipeline cut result on 2026-08-17:

1. Operation contract translation now lives in `operation-contracts/operation-analysis.mjs`,
   including inherited defaults, durable task metadata, HTTP ingress, local and imported named
   Values, input/output schema text, bridge metadata, graph-output derivation, client cache, helper
   declaration closure, and diagnostics.
2. `metadata-analyzer.mjs` now orchestrates Entity discovery, Entity-level task inventory, Operation
   collection resolution, unified-Entity `self` normalization, and final definition assembly. The
   Operation analysis module consumes discovery and graph-output analysis in one direction.
3. The facade decreased from 1,184 to 491 lines and all 51 tests pass. Global coverage remains
   79.15% statements, 71.62% branches, 83.71% functions, and 80.19% lines; Operation analysis has
   78.80% statement, 74.76% branch, 100% function, and 78.71% line coverage.

Tenth analysis-pipeline cut result on 2026-08-17:

1. Exported string constants, exported task-step declarations, Entity-level task inventory, import
   reference validation, and task diagnostics now live in
   `operation-contracts/task-analysis.mjs`.
2. `metadata-analyzer.mjs` preserves its public task-analysis exports through the compatibility
   facade while consuming only the task inventory needed for Domain Entity assembly.
3. The facade decreased from 491 to 294 lines and all 51 tests pass. Global coverage is 79.19%
   statements, 71.65% branches, 83.83% functions, and 80.23% lines; task analysis has 64.55%
   statement and line coverage, 63.01% branch coverage, and 90% function coverage. Invalid and
   cyclic task-constant variants remain visible targets for a focused semantic-coverage cut.

Eleventh analysis-pipeline cut result on 2026-08-17:

1. Domain Entity IR assembly now lives in `operation-contracts/domain-entity-analysis.mjs`, where
   Entity discovery, schema projection, Operation analysis, task inventory, ingress enrichment,
   unified-Entity `self` normalization, client-operation selection, helper deduplication, and
   diagnostics are composed into the final definition.
2. `metadata-analyzer.mjs` is now a 36-line compatibility facade responsible only for source
   parsing, syntax rejection, delegation, and preservation of the existing public exports.
3. All 51 tests pass. Global coverage remains 79.19% statements, 71.65% branches, 83.83% functions,
   and 80.23% lines; Domain Entity analysis has 86.30% statement and line coverage, 74.10% branch
   coverage, and 100% function coverage.

Slice 2 closure on 2026-08-17:

1. Parsing and syntax diagnostics, source/import resolution, Graph/Entity/Operation discovery,
   Entity schema and graph-output projection, Operation/task analysis, named-definition assembly,
   and Domain Entity IR assembly now have explicit dependency-directed modules.
2. Discovery resolves declarations without shared mutable side channels. Analysis boundaries return
   values plus diagnostics, and the Domain Entity boundary performs the remaining diagnostic and IR
   aggregation explicitly.
3. The compatibility facade no longer owns production analysis logic. Slice 3 may define the
   smallest Generated Module Model and introduce the first semantic emitter behind parity tests.

### Slice 3. Parallel Semantic Emitter

1. Define the smallest useful Generated Module Model.
2. Translate that model into TypeScript AST nodes through focused emitter functions.
3. Serialize only at the final TypeScript printer boundary.
4. Start with the smallest generated artifact, such as the task registry.
5. Run legacy and semantic emitters in parity tests without changing the public default.

First semantic-emitter cut result on 2026-08-17:

1. `generated-module/task-registry.mjs` defines the first Generated Module Model for an imported-task
   registry: explicit task-import bindings and explicit registry entries, with deterministic import
   path ordering and local-name allocation.
2. The semantic emitter translates that model into TypeScript Compiler API nodes for side-effect
   and named imports, generic `Map` construction, typed registry tuples, and the exported lookup
   function. Source text is produced only by the outer `ts.Printer` boundary.
3. A focused TDD suite asserts the model shape, syntax validity, and semantic AST parity with the
   legacy renderer. Generated tasks are rejected explicitly until their declarations and contract
   imports join the model in the next cut; the public renderer remains unchanged.
4. All 53 tests pass. Global coverage is 79.28% statements, 71.62% branches, 84.28% functions, and
   80.26% lines; the semantic task-registry module has 82.22% statement, 66.66% branch, 92.85%
   function, and 81.39% line coverage.

### Slice 4. Incremental Projection Migration

Migrate one projection family at a time:

1. imports and task registry;
2. Entity schema projections and deferred relations;
3. reusable named Values and their dependency graph;
4. client Entity exports;
5. Operation contracts, bridge metadata, and remaining opaque expressions.

For each family, assert Generated Module Model structure, TypeScript diagnostics, runtime behavior,
and deterministic output before deleting the corresponding legacy string builder.

### Slice 5. Cutover And Cleanup

1. Make the semantic emitter the only production path.
2. Remove legacy renderer and parity-only infrastructure.
3. Split remaining analyzer and emitter tests by responsibility.
4. Raise coverage thresholds to the demonstrated baseline of the extracted modules.
5. Document any intentional artifact-format drift and update generated fixtures.

## Scope

1. Organize analysis, validation, IR assembly, generated-module modeling, and rendering into clear
   module boundaries.
2. Improve semantic and branch coverage around current public behavior.
3. Replace dependency inference from rendered strings with explicit model dependencies.
4. Produce TypeScript through a semantic AST-backed emitter.
5. Preserve deterministic output and browser-safe generated modules.

## Non-Goals

1. Do not redesign Entity, Value, View, Query, Selection, or Operation APIs.
2. Do not create a server registry for caller-authored Views; Views remain client-owned.
3. Do not combine this maintenance work with the remote Query/Command protocol.
4. Do not move runtime authorization or execution semantics into codegen.
5. Do not require a new public codegen DSL or expose TypeScript AST nodes in Ontahi APIs.
6. Do not add `ts-morph` unless an implementation spike demonstrates a concrete advantage over the
   already available TypeScript Compiler API.

## Validation

Each slice should run, at minimum:

```sh
pnpm --filter @ontahi/codegen test
pnpm --filter @ontahi/codegen test:coverage
pnpm --filter @ontahi/codegen typecheck
pnpm --filter @ontahi/codegen lint
pnpm --filter @ontahi/codegen build
```

Run repository-level verification before publishing a PR. Add a Changeset when a slice changes a
published package; use an empty Changeset only when the repository release policy requires one for
internal-only work.

## Completion Signal

This plan closes when discovery, resolution, validation, Application IR assembly, generated-module
modeling, and TypeScript emission have explicit dependency-directed boundaries; generated source
is serialized only at the outer printer boundary; important modules are protected by semantic
typecheck and runtime tests; and the legacy string renderer has been removed.

## Suggested Starting Point For A Fresh Chat

1. Pull `main` and inspect repository instructions and this plan completely.
2. Move this plan from `plans/next` to `plans/current` when implementation actually begins.
3. Inspect the current coverage report and uncovered branches rather than relying only on the
   2026-08-16 baseline.
4. Propose a concrete Slice 1 TDD cut before changing production organization.
5. Work in the main Ontahi checkout unless the user explicitly asks for a worktree.
