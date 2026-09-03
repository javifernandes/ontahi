# 141. Data Graph Progressive Module Boundaries

Status: done

Canonical ID: `ontahi://plans/141-data-graph-progressive-module-boundaries`

Related plans:

1. [140. Colocated Test Topology](../done/140-colocated-test-topology.md)
2. [134. Semantic Codegen Pipeline, Organization, And Coverage](../current/134-codegen-analysis-organization-and-semantic-coverage.md)
3. [139. Relations Lifecycle Release Proof](../done/139-relations-lifecycle-release-proof.md)

## Summary

Give `@ontahi/core/data-graph` progressive internal boundaries so a contributor can first read the
portable graph vocabulary and then opt into authoring, query/command semantics, reflection,
runtime binding, or concrete execution. Preserve the supported `@ontahi/core/data-graph` entrypoint
and all runtime and TypeScript behavior while replacing flat, mixed-responsibility source units
with cohesive folders and small entrypoints.

Plan 140 intentionally colocated tests without reorganizing production code. That move made the
next problem visible: several source files and their tests now represent multiple logical units,
and the flat directory plus mega-barrel makes unrelated implementation layers appear equally
important to a reader.

## Evidence

At the start of this plan, production code under `packages/core/src/data-graph` contains about
16,000 lines. The largest mixed-responsibility units include:

1. `definitions.ts` (1,479 lines): graph schema types, fields, Entity and Relation definitions,
   authoring factories, storage mappings, and relation-field resolution;
2. `operations.ts` (1,387 lines): portable operation metadata, type-level API projection,
   resolution, authoring factories, and client Entity assembly;
3. `ref.ts` (1,135 lines): portable Ref identity, operation input authoring and normalization,
   Entity identity materialization, and runtime operation/relation binding;
4. `selection-assembly.ts` (1,039 lines): public selection typing, fluent assembly, command
   attachment, and runtime binding;
5. `data-graph/index.ts`: one flat export list spanning model, authoring, protocols, reflection,
   runtimes, clients, and the in-memory implementation.

The conceptual recursion between Entity, Relation, Ref, and Operation is valid. The current module
cycles are not automatically necessary: foundational definitions sometimes import runtime helpers
while those helpers import the definitions again. This indicates mixed layers and makes it harder
to know which code is portable vocabulary versus authoring or execution behavior.

## Dependency Direction

Organize by architectural role first and by graph noun inside that role:

```text
authoring --------> portable model <-------- reflection / protocols
                          |
                   query / command AST
                          |
                   runtime contracts
                          |
                in-memory / package adapters
```

The supported package entrypoint remains a compatibility facade. Internal folders should expose a
small local entrypoint only when it makes their cohesive surface easier to discover; nested barrels
must not conceal arbitrary cross-layer dependencies.

## First Slice: Ref

Turn the current `ref.ts` plus `ref/ref.test.ts` logical unit into a `ref/` folder with focused
modules:

1. `model.ts`: portable locator and Ref values, creation, validation, stable normalization, and
   equality;
2. `identity.ts`: Entity-definition-aware identity locator lookup and Ref materialization;
3. `input.ts`: Ref input declarations and their authoring builder;
4. `input-normalization.ts`: Ref derivation, query-key projection, and transport normalization;
5. `binding.ts`: bound methods and operation/relation affordances;
6. `index.ts`: the cohesive Ref facade re-exported by the existing data-graph entrypoint.

Split the existing Ref tests along the same observable contracts. This is a behavior-preserving
module-boundary change; direct consumers continue to import every supported symbol from
`@ontahi/core/data-graph`.

## Later Slices

1. Separate portable graph-schema, Field, Entity, Relation, and mapping definitions from their
   authoring factories without inventing duplicate concepts.
2. Separate portable Operation metadata and type projection from operation authoring and client
   binding.
3. Clarify query, command, reflection/protocol, runtime, client, and in-memory boundaries using the
   dependency direction above.
4. Address `selection-assembly.ts` only after the lower-level model and runtime seams are explicit;
   its generic TypeScript surface makes it a poor first extraction target.
5. Replace the flat internal topology incrementally while retaining the one supported public
   package entrypoint unless consumer evidence justifies another entrypoint.

## Non-Goals

1. No runtime behavior, generated contract, public export, or public type change.
2. No new graph concept or alternate Entity, Relation, Ref, Operation, Query, or Command model.
3. No provider, transport, React, Explorer, authorization, or relation-lifecycle feature work.
4. No repository-wide file move in one pull request.
5. No line-count-only fragmentation or catch-all `utils` modules.

## Acceptance Checklist

- [x] The first Ref slice has focused production modules and matching colocated tests.
- [x] Portable Ref model code does not depend on input authoring or runtime binding code.
- [x] `@ontahi/core/data-graph` exports the same Ref runtime symbols and TypeScript contracts.
- [x] Existing Core and downstream package imports compile without source-layout knowledge.
- [x] Focused tests, the Core suite, Core typecheck/build/lint, formatting, and artifact verification
      pass proportionally to the module-boundary change.
- [x] An empty Changeset records the package-internal organization decision.
- [x] The Source Code Organization Atlas item records the durable dependency direction after the
      first slice proves it.
- [x] Later mixed-responsibility units remain explicit follow-up slices rather than being silently
      dropped.

## Verification Baseline

Before the first move, `ref/ref.test.ts` and `data-graph/index.test.ts` pass 28 tests on
`main` at `d2e3725`.

## Decisions

1. Prefer layer direction over one folder per graph noun alone. Folders named only after mutually
   recursive concepts can preserve the same cycles while merely moving them.
2. Begin with Ref because its responsibilities are already independently observable and its
   colocated suite covers each one. Do not begin with the broader `definitions.ts` dependency hub.
3. Keep compatibility through the existing public facade rather than publishing internal source
   layout as new package entrypoints.
4. Stop the first pull request at the Ref boundary. `definitions.ts`, `operations.ts`, and
   `selection-assembly.ts` remain later behavior-preserving slices so their dependency risks are
   reviewed independently.

## First Slice Delivery

The former 1,135-line `ref.ts` is now a single `ref/` source boundary with an explicit top-down
entrypoint and five implementation roles: portable model, Entity identity, input authoring, input
normalization, and runtime binding. Core imports that boundary directly through `ref/index.ts`; no
duplicate root Ref module remains.

The previous and current surfaces both expose exactly 20 runtime symbols and 25 TypeScript symbols
through `@ontahi/core/data-graph`. Focused module tests were written red before the boundaries
existed and then passed alongside the existing Ref facade suite.

Verification for the slice:

1. Ref-focused and Data Graph facade tests: 35 passed;
2. complete Core suite: 80 files and 560 tests passed;
3. Core lint passed;
4. all ten package builds and typechecks passed;
5. repository formatting passed;
6. clean-room package artifact installation, typechecking, and runtime verification passed.

Later module-boundary work continues in
[141a. Data Graph Module Boundary Follow-Ups](../backlog/141a-data-graph-module-boundary-follow-ups.md).
It is independent cleanup rather than unfinished scope of the delivered Ref slice.

## Closure

- Status: done
- Closed on: 2026-09-03
- Delivered in: the Ref module-boundary slice
- Follow-up: [141a. Data Graph Module Boundary Follow-Ups](../backlog/141a-data-graph-module-boundary-follow-ups.md)
