# 74b. Schema-Native Operation Refs

Status: done

Canonical ID: `ontahi://plans/74b-schema-native-operation-refs`

Advances: [74a. Unit Of Work Runtime Scope](./74a-unit-of-work-runtime-scope.md)

Supports:

1. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
2. [137. Reflected Relation Affordances](../current/137-reflected-relation-affordances.md)

## Summary

Make the Operation input schema the single authored source for Entity Refs. A reference declared as
`field.ref(Entity)` is passed to the Operation implementation at the same field path, hydrated with
explicit runtime methods backed by the current UnitOfWork.

```ts
const inspectStudent = app.operation.define({
  input: graphSchema.object({
    student: field.ref(Student),
  }),
  run: ({ student }) =>
    Effect.gen(function* () {
      const current = yield* student.resolve();
      const refreshed = yield* student.refresh();
      return { current, refreshed };
    }),
});
```

## Evidence

`ReferenceFieldDefinition` already retains the target Entity and its identity/locator metadata.
Graph Schema reflection already emits an `entity-ref` descriptor from that field. The separate
Domain Operation `inputRefs` declaration repeats the target and optionality while also mixing in
legacy flat-locator normalization, runtime resolvers, receiver metadata, bridge cache keys, and
Explorer presentation.

Plan 74a proved the runtime store and authorization-safe resolver identity. This slice should make
that machinery disappear from ordinary Operation authoring before remote Command execution and a
more capable Explorer make the duplicated contract harder to remove.

## Scope

1. Derive top-level Operation Ref metadata from `field.ref(Entity)` and its optional/nullable
   wrappers.
2. Remove authored `inputRefs` from Domain Operation declarations.
3. Hydrate the Ref directly at its input field with non-enumerable `resolve()`, `invalidate()`, and
   `refresh()` methods.
4. Keep `resolve()` UnitOfWork-cached, make `invalidate()` local and synchronous, and define
   `refresh()` as invalidate followed by resolve.
5. Preserve the portable enumerable/serialized Ref shape.
6. Let `graphSchema.ref(Entity).resolveWith(...)` declare a custom resolver at the schema node when
   the default authorized Query is insufficient.
7. Derive Explorer Ref input descriptors and client bridge normalization from the input schema.
8. Remove ordinary application dependence on `app.runtime.unitOfWork.required()`.

## Non-Goals

1. Do not add automatic Command-driven invalidation or transaction mutation journals.
2. Do not implement nested-object or array Ref hydration in this first slice.
3. Do not preserve legacy flat locator inputs such as `studentId` when the schema declares a
   `student` Ref field.
4. Do not add remote Command execution in this slice.
5. Do not bind every Entity domain/relation method onto an Operation input Ref yet.

## Acceptance Checklist

- [x] `field.ref(Entity)` requires no parallel `inputRefs` authoring.
- [x] The Operation run input exposes the Ref at the declared field path with typed runtime methods.
- [x] `resolve()` reuses the UnitOfWork result and `refresh()` forces exactly one new authorized
      Query.
- [x] `invalidate()` and `refresh()` do not mutate the caller's portable Ref.
- [x] Optional and nullable Ref fields preserve absence/null without runtime affordances.
- [x] Custom resolution is declared on `graphSchema.ref(Entity)` rather than beside the schema.
- [x] Explorer derives semantic Ref input controls from reflected schema metadata.
- [x] Client bridge query keys remain stable for direct portable Refs without authored metadata.
- [x] Public changes include a Changeset and durable Ref/UnitOfWork documentation is updated.
- [x] Focused tests, affected package suites, typecheck, lint, formatting, and artifact verification
      pass.

## Split Point

Stop once schema-native top-level Refs replace authored `inputRefs` end to end. Automatic
invalidation, transaction commit propagation, Classroom, remote Commands, and richer bound Ref
methods remain later plans.

## Closure / Evolution

The Operation input schema is now the only authored source for top-level Entity Refs. Both
`field.ref(Entity)` and `graphSchema.ref(Entity)` preserve the target Entity in inferred input
types; server implementations receive the Ref at the declared path with typed `resolve()`,
`invalidate()`, and `refresh()` methods. The runtime attaches those methods to a fresh copy as
non-enumerable properties, leaving the caller's portable Ref and its serialized shape unchanged.

Default resolution constructs an Entity Query through the active Data Graph runtime. Custom
resolution uses `graphSchema.ref(Entity).resolveWith(resolver)`, stored as runtime-only sidecar
metadata so neither schema reflection nor transport serializes an application callback. Both paths
delegate reuse and eviction to the current UnitOfWork without requiring ordinary application code
to access `app.runtime.unitOfWork.required()`.

The server invocation path, React bridge, graph client cache, and Explorer no longer consume an
authored Domain Operation `inputRefs` bag. Explorer retains an `inputRefs` DTO only as a computed
presentation descriptor derived from reflected schema target and locator metadata. Legacy flat
locator lowering was removed from Domain Operation transport. The TodoApp's `TodoItem.create`
Operation is the practical proof: it now validates its `list` participant with `list.resolve()`.

Delivery verification:

1. Core: 86 files and 596 tests passed.
2. React: 11 files and 68 tests passed.
3. Explorer React: 22 files and 115 tests passed.
4. Runtime Express: 4 files and 26 tests passed.
5. Todo Express: 5 files and 29 tests passed.
6. Repository typecheck, lint, formatting, package builds, Changeset status, and clean-room artifact
   installation/type/runtime verification passed.

Automatic Command-driven invalidation, transaction commit propagation, nested/array Ref hydration,
Classroom, and remote Command execution remain deliberately outside this slice.
