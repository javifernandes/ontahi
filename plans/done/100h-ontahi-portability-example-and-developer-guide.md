# 100h. Ontahi Portability Example And Developer Guide

Status: done

Canonical ID: `ontahi://plans/100h-ontahi-portability-example-and-developer-guide`

Migrated from: `bookops://plans/100h-ontahi-portability-example-and-developer-guide`
Original path: `plans/done/100h-ontahi-portability-example-and-developer-guide.md`
Source commit: `cb9c038a`

Parent plan: [`100. Ontahi Framework Extraction`](../done/100-ontahi-framework-extraction.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Depends on:

1. [`100f. Operation Invocation Capability`](../done/100f-operation-invocation-capability.md)
2. [`100g. Ontahi Codegen And Application Tooling Boundary`](../done/100g-ontahi-codegen-and-application-tooling-boundary.md)
3. [`100j. Ontahi In-Memory Persistence Runtime`](../done/100j-ontahi-in-memory-persistence-runtime.md)
4. [`116. Ontahi Selection Model`](ontahi://plans/116-ontahi-selection-model)

## Summary

Build one deliberately small non-BookOps application under `ontahi/examples/*` and use it as the spine of an install-to-running-app developer guide.

This is the bounded portability proof for the extraction line. It should demonstrate that a developer can declare entities, describe entity sets through Selection, configure runtime capabilities, expose and invoke operations, and inspect the application without knowing BookOps internals.

## Context

Package separation inside the BookOps monorepo proves dependency direction, but not independent usability. A second application is the fastest way to expose hidden BookOps assumptions in public APIs, codegen, runtime composition, environment setup, and documentation.

Entity, Selection, and Operation now form a central Ontahi language chain. The example should prove that chain outside BookOps: declare an entity, author a Selection by extension or comprehension, transport it as an operation input, and evaluate it through the same in-memory runtime used by graph reads and commands.

The example should remain smaller than Atlas and smaller than a production BookOps feature. Its value is architectural pressure and teachability, not product scope.

## Scope

1. Add one small domain with entities and synchronous plus durable operations.
2. Make at least one operation accept a graph-native Selection and exercise both reference-defined and predicate-defined membership.
3. Use the in-memory reference implementation where possible so the first run requires no external infrastructure.
4. Exercise at least one operation transport outside BookOps.
5. Exercise `@ontahi/codegen` for any required browser-safe or static artifacts.
6. Mount Ontahi Explorer when doing so materially improves the end-to-end proof.
7. Write developer documentation from installation through declaration, Selection authoring, runtime composition, invocation, and inspection.
8. Record every BookOps assumption discovered as either a framework fix or an explicit host responsibility.
9. Add a minimal React UI that consumes generated declarations through public `@ontahi/react` hooks.

## Non-Goals

1. Building a production-grade second product.
2. Proving every adapter or runtime combination.
3. Waiting for direct PostgreSQL, DBOS, Redis, package publishing, or the independent Ontahi repository.
4. Duplicating BookOps authentication, editorial UI, collaboration, or deployment topology.
5. Turning the example into an exhaustive framework reference.
6. Extending the settled Selection algebra with relation predicates, named or saved selections, a language editor, or Alive UI behavior.

## Proposed Form

A compact project or reading-list domain is sufficient:

```ts
const TodoEntity = entity('Todo', {
  id: field.id(),
  title: field.string(),
  completed: field.boolean(),
})
  .locators({ refById: 'id' })
  .identity('refById');

const CompleteTodosInput = value('CompleteTodosInput', {
  todos: graphSchema.selection(TodoEntity, { cardinality: 'many' }),
});

const Todo = app.graph.defineEntity(TodoEntity, {
  domainOperationDefaults: {
    authority: 'server',
    exposure: 'bridge',
  },
  domainOperations: {
    complete: app.operation.define({
      input: CompleteTodosInput,
      run: input => completeTodos(input.todos),
    }),
  },
});

const incompleteTodos = selection(TodoEntity, todo => todo.completed.eq(false));
const chosenTodos = Selection.references(TodoEntity, [
  createEntityRef(TodoEntity, { id: 'todo-1' }),
]);
```

The example should make host composition visible without reimplementing framework internals:

```ts
export const appRuntime = createOntahiApplication({
  graph,
  persistence: createInMemoryGraphRuntime(),
  transport: createExpressOperationTransport(),
});
```

The exact declaration and composition APIs should follow the current public surface rather than treating this sketch as settled syntax. The domain and host should maximize coverage of Entity, Selection, Operation, transport, and runtime composition while keeping setup and explanation small.

## Execution Slices

### Slice 1: Portability Fixture

- [x] Select the smallest domain and host that exercise Entity, Selection, Operation, runtime composition, transport, and codegen where required.
- [x] Add the example under `ontahi/examples/*` with no BookOps imports.
- [x] Give the example an operation whose target is a reflected graph-native Selection.
- [x] Keep environment setup dependency-free or one-command local.

### Slice 2: Public Bootstrap Surface

- [x] Replace hidden BookOps assumptions discovered by the example with public Ontahi configuration or explicit host adapters.
- [x] Keep application domain declarations in the example and reusable behavior in packages.
- [x] Add automated end-to-end operation invocation tests for reference-defined and predicate-defined selections.
- [x] Verify Selection cardinality and validation failures through the same public invocation boundary.

### Slice 3: Developer Guide

- [x] Document package selection and installation.
- [x] Document Entity, Selection, and Operation declarations as one coherent language chain.
- [x] Document runtime capability composition and transport mounting.
- [x] Document codegen only where a static boundary requires it.
- [x] Document Explorer mounting or explain why it is omitted from the minimal path.
- [x] Link conceptual terms to the same contracts and package entrypoints used by the code.

### Slice 4: React Portability UI

- [x] Add a small Vite-powered React client without BookOps or Next.js dependencies.
- [x] Load graph state through `useOperationQuery` and the public Fetch bridge.
- [x] Create and complete Todos through `useOperation`, including Selection transport and query invalidation.
- [x] Start the in-process durable operation through `useDurableOperation` and expose its run identity.
- [x] Serve the production UI from the same Express host and document the one-command path.

## Verification

- [x] A new checkout can install and run the example using documented commands.
- [x] The example declares and invokes operations without BookOps source imports or path aliases.
- [x] At least one invalid input produces the canonical Ontahi validation result.
- [x] At least one successful invocation exercises the selected transport end to end.
- [x] Reference-defined and predicate-defined selections cross the transport and target the expected in-memory entities.
- [x] The example uses only the settled Selection algebra and does not hide future Selection features in local helpers.
- [x] Required generated artifacts are reproducible through public Ontahi tooling.
- [x] Documentation snippets compile or are exercised by tests.
- [x] The example remains small enough to understand in one focused reading session.
- [x] The React UI compiles against generated client entities and public `@ontahi/react` entrypoints.
- [x] A browser-level smoke test creates, selects, completes, and starts a durable Todo operation through the UI.

## Decisions

1. The first example is a portability proof, not a reference production architecture.
2. In-memory state is acceptable for the first-run path; persistence adapters remain separate capability work.
3. The guide should teach concepts through runnable code rather than narrating BookOps history.
4. Framework gaps found by the example should be fixed at the smallest honest boundary, not hidden in example-local helpers.
5. Entity, Selection, and Operation are taught together; Selection is not reduced to an incidental UI filter.
6. The example uses only the established scalar, reference, Boolean-composition, and cardinality semantics. Deferred Selection research remains outside this plan.

## Open Questions

1. Does a minimal Next.js host exercise more important public surfaces than an Express host, or add too much setup noise?
2. Should Explorer be part of the default example or a second optional mounting step?
3. Is one synchronous operation plus one durable operation still small enough for the first guide?
4. Should the example demonstrate both `one` and `many` Selection cardinality, or keep one as a focused validation test?

## Closure / Evolution

This plan closes when the example and guide provide independent evidence for the extraction plan's package, tooling, runtime-composition, and documentation boundaries.

Direct PostgreSQL, additional durable runtimes, publishing, release automation, and the separate Ontahi repository remain later plans under the broader Goal rather than prerequisites for this bounded example.

## Closure

- Status: done
- Closed on: 2026-07-22
- Effective effort: ~1.5h focused work
- Landed shape: `ontahi/examples/todo-express` provides the Express portability fixture, developer guide, deterministic client codegen, Selection-targeted synchronous operations, an in-process durable operation, canonical validation, and transport-level tests.
- Framework fixes: `@ontahi/codegen` now resolves NodeNext JavaScript specifiers to TypeScript sources and accepts a host-owned schema import path for generated client entities.
- Selection ergonomics: membership Selections now expose declarative `update(...)` commands, and synchronous domain operations execute returned graph commands automatically inside their configured runtime context. The example's complete logic is only `input.todos.update({ completed: true })`.
- Explorer decision: omitted from the minimal Express host because it requires a React routing shell; the reflected `GET /application` endpoint covers inspection without expanding the example into a browser app.
- React UI extension: reopened on 2026-07-23 and completed with a Vite client using `OntahiGraphProvider`, Fetch bridge adapters, query/mutation hooks, cache invalidation, Selection transport, and durable-operation hooks.
- React/codegen ergonomics: generated client declarations preserve input and output contracts, hooks infer their types without local generics, no-input operations execute without `{}`, and browser callers author membership through typed `Selection` values rather than raw transport ASTs.
