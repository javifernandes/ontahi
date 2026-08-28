# 142e. Portable Operation Condition Bridge

Status: next

Canonical ID: `ontahi://plans/142e-portable-operation-condition-bridge`

Parent: [142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md)

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

- [ ] Core owns one versioned JSON-safe IR and semantic evaluator.
- [ ] Codegen derives symbols from the real Operation/Entity model with source-located diagnostics.
- [ ] Server and generated client artifacts consume the same compiled condition identity and IR.
- [ ] Advisory evaluation is tri-state and never substitutes for authoritative execution.
- [ ] Callback-valued top-level contracts have one explicit alpha migration path.
- [ ] Classroom's same-Course branch is replaced by the first portable condition.
