# 142e. Portable Operation Condition Bridge

Status: done

Canonical ID: `ontahi://plans/142e-portable-operation-condition-bridge`

Parent: [142. Declarative Model Semantics And Execution Planning](./142-declarative-model-semantics-and-execution-planning.md)

Predecessor: [142d. Existing Operation Refs](../done/142d-existing-operation-refs.md)

## Summary

Promote the expression subset proved in Plan 142b into canonical Core IR and connect build-time
TypeScript analysis to server execution metadata, generated clients, reflection, and tri-state
advisory evaluation. Only after that bridge exists, replace callback-valued top-level
`contracts.pre/post` with named portable conditions and preserve `contract(...)` as the explicit
opaque server-only escape hatch.

## Risk To Prove

The experiment can compile natural TypeScript without executing callbacks, but it currently owns a
fixture-provided symbol table and produces no server artifact. Executing author callbacks to
discover metadata would admit arbitrary code; requiring authors to duplicate a callback and JSON
IR would create two sources of truth. The next slice must establish one generated semantic artifact
that both the authority and clients consume.

## First Vertical Slice

1. Move the versioned JSON-safe expression IR and interpreter to technology-independent Core.
2. Derive the compiler symbol table from one Operation's input schema and Entity model.
3. Compile and register one named pure input condition:

   ```ts
   differentCourses: ({ previousCourse, nextCourse }) => !previousCourse.is(nextCourse);
   ```

4. Execute it authoritatively before the body, reflect its dependencies and conventional
   rejection, and evaluate it client-side as satisfied/rejected/unknown.
5. Remove/deprecate the callback-valued top-level `contracts` property in the same public migration;
   keep `contract(...)` for deliberately opaque checks.

## Non-Goals

1. No stateful Relation precondition lowering, postcondition, derived Field, or aggregate
   invariant in the first bridge proof.
2. No execution of arbitrary callbacks during declaration or transport.
3. No provider-specific expression or policy syntax.
4. No generic remote Entity Commands.

## Acceptance Checklist

- [x] Core owns one versioned JSON-safe IR and semantic evaluator.
- [x] Codegen derives symbols from the real Operation/Entity model with source-located diagnostics.
- [x] Server and generated client artifacts consume the same compiled condition identity and IR.
- [x] Advisory evaluation is tri-state and never substitutes for authoritative execution.
- [x] Callback-valued top-level contracts have one explicit alpha migration path.
- [x] Classroom's same-Course branch is replaced by the first portable condition.

## Closure

Core now owns the canonical Model Expression program, validation, dependency collection, explicit
builder, interpreter, condition registry, and tri-state evaluator. Codegen derives Ref symbols from
real Operation input schemas, compiles natural TypeScript without invoking callbacks, emits one
shared registry, and makes generated clients reference it. Missing or stale generated conditions
fail closed during server composition.

The public alpha migration is complete: top-level `contracts.pre` accepts named portable
conditions; arbitrary pre/post callbacks move to the explicit `contract(...)` concern. Reflection
and Explorer expose named conditions, while runtime execution remains authoritative and preserves
atomic rollback for opaque contracts. Classroom generates a conditions-only artifact, uses it in
the server application and advisory proof, and no longer contains an imperative same-Course
branch.

Follow-up: [142f. Virtual Derived Fields And Classroom Capacity](142f-virtual-derived-fields-and-classroom-capacity.md).

## Verification

1. Core, Codegen, Explorer React, Runtime Next.js, and Classroom focused/full test suites pass.
2. Classroom's five PostgreSQL integration tests pass against its isolated service.
3. Affected typechecks, lints, builds, generated-artifact drift checks, and repository format check
   pass.
4. Core, Codegen, and Explorer coverage suites pass; their overall statement coverage is 89.15%,
   84.76%, and 83.01% respectively.
5. All ten public packages build and pass clean-room package artifact verification.
6. Changeset status resolves the fixed package group to one minor prerelease increment.
