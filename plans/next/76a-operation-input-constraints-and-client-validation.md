# 76a. Operation Input Constraints And Client Validation

Status: next

Canonical ID: `ontahi://plans/76a-operation-input-constraints-and-client-validation`

Migrated from: `bookops://plans/76a-operation-input-constraints-and-client-validation`
Original path: `plans/next/76a-operation-input-constraints-and-client-validation.md`
Source commit: `cb9c038a`

Materializes [`Operation Inputs`](ontahi://atlas/operation-contracts/operation-inputs): reflected operation inputs should carry enough portable meaning for generated UIs and agents to validate drafts without duplicating the authoritative runtime contract.

## Summary

This plan adds constraint fidelity and client-side validation to operation input descriptors.

Ontahi Explorer already renders refs, enums, booleans, numbers, and schema variants. Ontahi's
graph-native schema descriptors now preserve common scalar constraints. The remaining work is
making every generated client and control consume that metadata consistently enough to catch
obvious invalid drafts before invoking the server.

> [!FUTURE]
> target: [[ontahi.model.operation-input|Operation Input]]
> Reflected operation inputs should carry enough scalar constraints for generated UIs and agents to validate drafts without duplicating server-side rules.

## Context

The framework already has rich Zod constraints:

```ts
limit: z.number().int().min(1).max(100).optional();
email: z.string().email();
```

Today not all of that metadata reaches Ontahi Explorer or generated clients.

Source plan:

1. [76. Operation Input Metadata And Invocation UI](bookops://plans/76-operation-input-metadata-and-ui)

Related plans:

1. [79. Graph-Native Schema DSL](bookops://plans/79-graph-native-schema-dsl)
2. [75b. Canonical Operation Invocation Results](bookops://plans/75b-canonical-operation-invocation-results)

## Research / Evidence

Current pressure appears in:

1. `packages/explorer-react/src/server/schema-descriptor.ts` in the Ontahi repository
2. `packages/explorer-react/src/components/operation-execute-panel.tsx` in the Ontahi repository
3. `packages/explorer-react/src/components/operation-executor.ts` in the Ontahi repository
4. `packages/explorer-react/test/server/schema-descriptor.test.ts` in the Ontahi repository
5. `packages/explorer-react/test/components/operation-execute-panel.test.tsx` in the Ontahi repository
6. `packages/core/src/runtime/contracts.ts` in the Ontahi repository

Continue from graph-native descriptors. Zod validation and JSON Schema are derived adapters, not
parallel sources of constraint meaning.

## Scope

This plan covers scalar constraint reflection and first client validation.

It includes:

1. numeric min/max/integer/multiple-of metadata,
2. string length/pattern/format metadata,
3. array item/min/max metadata where practical,
4. closed scalar exclusions where the accepted set can be described directly,
5. Explorer control attributes from constraints,
6. pre-submit validation feedback,
7. tests around descriptor extraction and execution-form behavior.

## Non-Goals

Do not remove the Zod validation or JSON-schema projection adapters in this slice.

Do not extract a full form framework.

Do not infer relationship-derived cascading selectors.

Do not solve polymorphic entity refs.

Do not make client validation a security boundary.

## Proposed Form

Example graph-native input:

```ts
graphSchema.optional(field.integer({ min: 1, max: 100 }));
```

should reflect close to:

```ts
{
  path: 'limit',
  kind: 'integer',
  required: false,
  constraints: {
    min: 1,
    max: 100,
  },
}
```

Explorer should render it with:

```txt
type=number
step=1
min=1
max=100
```

and show local feedback before invocation if the draft is invalid.

Application code can inspect the complete contract directly:

```ts
TodoList.domain.rename.input.safeParse(draft);
```

React can bind draft state and invocation without introducing a second validation contract:

```ts
const { input, execute: rename } = useOperation(TodoList.domain.rename, initialDraft);
```

## Execution Slices

1. Extend schema descriptor extraction for numeric constraints.
2. Extend schema descriptor extraction for string constraints and common formats.
3. Reflect nullable and optional distinctly where the current descriptor is lossy.
4. Add array item/min/max metadata where straightforward.
5. Apply control attributes in Explorer.
6. Add local draft validation before invocation.
7. Render canonical `input_invalid`, `rejected`, `failed`, and `errored` invocation results natively.
8. Reuse canonical `OperationValidationIssue` paths for inline field feedback.
9. Keep the JSON/expression editor and raw invocation result as inspection fallbacks.
10. Add tests using real constrained inputs such as `Book.deleteBook` confirmation and task-run list `limit`.
11. Preserve excluded string values, comparison semantics, and their validation message through
    graph-native descriptors and JSON-schema projection.
12. [ ] Preserve the semantic provenance of an Entity field reused by an operation input (for
        example, `TodoList.name`) in reflected descriptors instead of retaining only its flattened
        constraints.
13. [x] Expose normalization and portable validation on the complete generated operation input as
        `operation.input.safeParse(draft)`.
14. [x] Add a first headless React binding where `useOperation(operation, initialInput)` owns the
        draft, field issues, normalized value, and zero-argument execution.

## Verification

- [ ] `field.integer({ min: 1, max: 100 })` reflects `kind: 'integer'`, `min`, and `max`.
- [ ] `field.email()` reflects `format: 'email'`.
- [ ] Numeric controls use matching `min`, `max`, and `step`.
- [ ] Email/URL strings use appropriate input modes or types.
- [x] Missing required inputs show local feedback and block operation invocation.
- [x] Canonical `input_invalid`, `rejected`, `failed`, and `errored` results have native feedback.
- [x] JSON/expression input and raw invocation result fallbacks remain available.
- [x] Tests cover required scalar/ref inputs and Ontahi Explorer execution-form behavior.
- [ ] Tests cover descriptor extraction and richer constraint behavior.
- [x] Excluded string values are validated and reflected as structured metadata rather than an
      opaque executable precondition.
- [x] Generated operation inputs validate public Ref, identity, and materialized-value forms before
      transport execution.
- [x] A managed React operation blocks locally invalid drafts without calling the bridge and
      executes the exact normalized value it validated.

## Decisions

Expose framework-level descriptors to clients rather than Zod-specific details.

Client validation is for fast feedback only.

Portable client validation consumes Explorer descriptors and returns the canonical
`OperationValidationIssue[]` shape; it does not depend on Zod or another source schema library.

Required fields, closed exclusions, and input-local cross-field rules belong to input validation.
Rules that require resolving application state remain authoritative runtime failures.

The graph-native schema DSL is the source of truth. Zod and JSON Schema are validation and
projection adapters derived from it.

`operation.input.safeParse(draft)` is the low-level public validation surface. Higher-level UI
bindings consume it rather than importing a separate parser or recreating field rules.

`useOperation(operation, initialInput)` is the first headless input binding. The original
`useOperation(operation, options)` plus `execute(input)` form remains canonical when another owner
already manages the input.

## Closure / Evolution

This plan remains ready for constraint reflection and control fidelity, but it is not active during
the independent-distribution study.

The first checkpoint now blocks locally incomplete required inputs, annotates scalar and entity-ref
controls, and renders canonical invocation failures natively while preserving raw JSON inspection.
Generated operations also own portable draft parsing, and React can bind that contract to editable
input state and execution through one hook.

The remaining slices cover numeric/string/array constraints and their corresponding controls.
