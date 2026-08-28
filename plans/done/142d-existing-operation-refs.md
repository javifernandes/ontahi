# 142d. Existing Operation Refs

Status: done

Canonical ID: `ontahi://plans/142d-existing-operation-refs`

Parent: [142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md)

Follow-up: [142e. Portable Operation Condition Bridge](../next/142e-portable-operation-condition-bridge.md)

## Summary

Let an Operation declare that a top-level Entity Ref must resolve before its implementation runs.
Add `graphSchema.existingRef(Entity)` as one input-schema fact, resolve it through the authorized
UnitOfWork, fail conventionally when no participant is visible, and pass the resolved participant
to the body together with its original portable identity.

## Evidence And Risk

Schema-native `graphSchema.ref(Entity)` already owns transport validation, target reflection,
default authorized Query resolution, custom resolver sidecars, and UnitOfWork caching. Before this
slice, Classroom repeated three `resolve()` calls and three absence branches because the schema
could not express that those participants were required to exist.

The primary risk is creating a second Ref declaration or resolving outside the Operation's selected
atomic boundary. `existingRef` must therefore remain a specialized Ref schema node, reuse the same
resolver and cache, run after authored execution requirements but before the implementation, and
be reflected without transporting a resolver callback or current Entity data.

Plan 142b's expression compiler is not production infrastructure yet: it has a fixture-owned
symbol table and no server artifact bridge. This slice must not disguise an executed callback as a
portable condition. The linked 142e follow-up owns that promotion before `contracts.pre/post` are
replaced.

## Intended Contract

```ts
transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(Student),
    previousCourse: graphSchema.existingRef(Course),
    nextCourse: graphSchema.existingRef(Course),
  }),
  run: ({ student, previousCourse, nextCourse }) =>
    Effect.gen(function* () {
      // Fields are already authorized and resolved. Identity remains explicit.
      yield* students.refById(student.id).currentCourse.assign(nextCourse.ref).run();
    }),
});
```

The public caller still supplies an ordinary portable Ref. The implementation receives the
resolved object plus a non-enumerable `.ref` identity. `ref` is reserved on an Entity projection
used through `existingRef`; a target declaring a Field with that name is rejected rather than
silently overwritten.

Missing or graph-policy-filtered data produces the safe conventional failure:

```ts
{
  reason: 'entity_not_found',
  message: 'Referenced Student was not found.',
  entityName: 'Student',
  inputPath: 'student',
}
```

## Scope

1. Add the schema node, client/run input types, descriptor, JSON Schema extension, and generated
   client preservation.
2. Support required, optional, and nullable top-level Ref fields in object or Value Operation
   inputs; nested and array positions fail at declaration time until their traversal semantics are
   implemented.
3. Reuse default or schema-local custom authorized resolution and the active UnitOfWork cache.
4. Resolve after authored requirements and inside `operation.atomic` when atomicity is required.
5. Do not evaluate the Operation body when a required participant is absent.
6. Reflect the requirement in Explorer and distinguish `Existing<Entity>` from an ordinary Ref in
   the Operation signature without exposing resolved data.
7. Migrate only Classroom's repeated existence resolution; leave same-Course, stale-current,
   capacity, and counter logic for later declarative-condition/invariant/derived-Field slices.

## Non-Goals

1. No portable precondition or postcondition syntax in this slice.
2. No expression IR promotion, advisory client evaluation, or permanent invariant.
3. No nested/array existing Ref hydration.
4. No automatic Command invalidation or richer Entity/Relation methods on `.ref`.
5. No durable Operation support; deferred execution needs its own resolution lifecycle contract.
6. No generic remote Entity Command or Explorer mutation UI.

## Acceptance Checklist

- [x] Public callers pass the same portable Ref shape to `existingRef` inputs.
- [x] The body receives resolved typed fields plus the original `.ref` identity without an
      explicit `resolve()` or absence branch.
- [x] Repeated resolution work is reused through the selected UnitOfWork.
- [x] Missing participants produce the stable safe `entity_not_found` failure before the body.
- [x] Authored requirements run before resolution, and atomic Operations resolve inside their
      transaction boundary.
- [x] Reflection, JSON Schema, codegen, and Explorer preserve the existence requirement.
- [x] Unsupported nested and durable declarations fail explicitly.
- [x] Classroom removes its three manual existence checks without changing the remaining transfer
      semantics.
- [x] Public packages carry a Changeset and Atlas/developer documentation records the boundary.
- [x] Focused tests, affected suites, typecheck, lint, build, format, and artifacts pass.

## Split Point

Stop when one real Classroom Operation consumes existing participants end to end. Do not pull the
condition compiler, derived capacity, aggregate invariant, or remote Entity Commands into this PR.
