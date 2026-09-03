---
id: ontahi.graph-native-schema-dsl
kind: capability
title: Graph-Native Schema DSL
parent: ontahi
status: active
horizon: now
supports:
  - ontahi.model
  - ontahi.operation-contracts
  - ontahi.durable-workflows
relatedPlans:
  - bookops://plans/79-graph-native-schema-dsl
  - bookops://plans/75d-graph-native-durable-operation-lifecycle-contracts
migratedFrom: bookops://atlas/operation-contracts/graph-native-schema-dsl
sourceCommit: 67713696
---

Graph-Native Schema DSL is Ontahi's declarative schema language for Entities, Fields, Values,
Views, Refs, Selections, operation inputs and outputs, validation, and reflected lifecycle shapes.
Operation contracts are an important consumer, but they do not own the language. Zod and other
validators remain generated adapters rather than the conceptual model.

The same language should describe every reflected durable lifecycle boundary, including progress snapshots and task-step outputs, without introducing a second task-specific schema system.

This item was promoted from the historical identity
`ontahi.operation-contracts.graph-native-schema-dsl` after the language proved broader than its
first Operation Contract use cases.

## Established Language

The completed Plan 79 established the graph model as the semantic source of truth:

1. Entities declare identity-bearing shapes and can serve directly as complete result contracts.
2. Views declare identity-preserving projections over Entities.
3. Values declare named shapes without independent Entity identity.
4. Fields, Refs, composition, constraints, and refinements retain semantic and validation meaning.
5. Reflection and generated clients consume stable graph-native descriptors.
6. Runtime validators are compiled from those descriptors; Zod is not exposed as the operation
   contract.

The language remains open to evidence-driven extensions. That does not make its completed
graph-native foundation or Operation Contract migration active implementation work.

## Boundary With Other Ontahi Languages

The schema DSL declares the shape and semantics of values. It is adjacent to, but distinct from:

1. [[ontahi.model.selection|Selection]], whose canonical AST describes Entity membership and can be
   edited textually or structurally;
2. [[ontahi.model.model-expression|Model Expression]], whose canonical IR describes portable
   calculations and conditions; and
3. [[ontahi.runtime-protocol|Ontahí Runtime Protocol]], which transports independently versioned
   operation, durable-operation, graph-read, and graph-command families.

Those forms should share Ontahi names, reflection, diagnostics, and tooling where useful. They
should not be collapsed into one AST merely because a future textual surface may expose several of
them. The first rich filtering surface belongs to the Selection language and its canonical AST,
not to schema declaration or to the Runtime Protocol envelope.

## Defining contracts from existing concepts

An operation contract does not need to repeat fields that already have a semantic home. A named value can select a shape from an entity:

```ts
const CreateTodoInput = graphSchema.pick(TodoEntity, ['id', 'title']).named('CreateTodoInput');
```

`pick` preserves the selected field definitions—including validation, presentation, and inferred TypeScript types—while intentionally leaving behind entity identity, relations, mappings, and operations. `named` gives the resulting value a stable name for reflection and generated clients.

The reflected contract records that it was derived with `pick`, the source concept, and the selected fields. Tooling can therefore explain that `CreateTodoInput.title` comes from `Todo.title` instead of presenting it as an unrelated duplicate.

This is schema composition in the implementation vocabulary, but conceptually it is **defining a contract from existing model capabilities**. Inputs are one important use case; standalone values and other object-shaped contracts may also be sources. Explicit field definitions remain appropriate when an input introduces genuinely new semantics.

The composition family should remain small and predictable:

- `pick`: keep named fields from a source;
- `omit`: remove named fields from a source;
- `partial`: make the selected contract optional for patch-like inputs;
- `extend`: add or deliberately replace fields with new semantics.

Only `pick` is currently part of the public API. The remaining operators describe the intended vocabulary and should be added when a concrete operation needs them.

## Operations without input

An operation with no arguments omits `input` entirely:

```ts
list: app.operation.define({
  output: ListTodosOutput,
  run: () => Todo.all().run(),
});
```

Ontahi supplies the empty transport contract. Declaring `value('ListTodosInput', {})` adds a name but no domain meaning, so it should not be required or encouraged.

## Entity results

When an operation returns a complete entity, the entity itself is the output contract:

```ts
create: app.operation.define({
  input: CreateTodoInput,
  output: TodoEntity,
  run: input => Todo.insertReturning(/* ... */),
});
```

Repeating every entity field in a `TodoOutput` value loses semantic information and creates maintenance work. Use `pick(...).named(...)` for a deliberately partial or value-shaped result; use the entity directly when the result represents that entity.

## Returning graph work

An operation may return a graph selection or command directly. The runtime executes it in the operation's graph context:

```ts
run: () => Todo.all().orderBy(todo => todo.title);
```

```ts
run: input =>
  Todo.insertReturning({ id: input.id, title: input.title, completed: false }, [
    'id',
    'title',
    'completed',
  ]);
```

Calling `.run().pipe(Effect.orDie)` at this boundary is transport mechanics, not domain logic. Explicit execution remains useful when an operation needs to compose the result with additional effects; a returned graph value is the concise path when the graph work is the complete operation.

## Locality and durable defaults

Small contracts used by one operation should usually be declared inline. Give a contract a top-level name when the name is useful to reflection, the contract is reused, or it represents a durable lifecycle boundary.

Durable operations inherit their final-output contract from the operation's `output`, and their task id from the operation id. Override `finalOutput` or `taskId` only when those lifecycle concepts intentionally differ. Likewise, entity-level operation defaults should not be repeated on each operation.
