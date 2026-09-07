# 118a. Explorer Selection Language Walking Skeleton

Status: done

Canonical ID: `ontahi://plans/118a-explorer-selection-language-walking-skeleton`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118 Ontahí Selection Language Editor Research](../done/118-ontahi-selection-language-editor.md)

Followed by:

1. [118b Selection Expression Algebra](../next/118b-selection-expression-algebra.md)
2. [118c Reflection-Powered Selection Language Service](../backlog/118c-reflection-powered-selection-language-service.md)
3. [118d Projectional Selection Editor Experiment](../backlog/118d-projectional-selection-editor-experiment.md)

## Architectural Question

Can one recoverable textual predicate lower to the existing Selection AST, execute through the
existing `graph.read` Runtime Protocol, and drive Explorer Entity Data without making Explorer's
current filter contract or CodeMirror a new semantic boundary?

## Summary

Deliver one deliberately narrow, opt-in Todo proof:

```text
completed = false
```

The selected Explorer Entity supplies `TodoItem`. The parser recognizes one Boolean equality;
semantic resolution confirms `completed` is a reflected Boolean Field; lowering produces the
existing `SelectionAst`; the configured Runtime Transport executes a bounded Graph Read; Explorer
renders the returned rows and separates syntax, semantic, and execution failures.

This is a walking skeleton, not the first half of a complete grammar. Every new abstraction must
participate in that visible path.

## Current Evidence

1. Core already owns the required predicate node in `selection-ast.ts` and transports it in
   `GraphReadRequestV1`.
2. TodoItem's Graph Read policy already permits `completed.eq` and selects all four Entity Fields.
3. Todo's Explorer runs under an `OntahiGraphProvider` whose configured Runtime Transport supports
   `graph.read` over HTTP or WebSocket.
4. Explorer's current Entity descriptor exposes `completed` as a non-null Boolean.
5. Explorer's current Data filter uses `ReflectedEntityDataFilter`; lowering into that contract
   would not prove the intended architecture.

## Scope

1. Add `@ontahi/language` as an editor-neutral public package with:
   - a generated Lezer parser for optional whitespace plus one contextual
     `FieldName = BooleanLiteral` expression;
   - a narrow structural Entity reflection input owned by the language service;
   - syntax diagnostics with source ranges;
   - semantic resolution for Field existence, Boolean type, and Boolean literal compatibility;
   - lowering to Core's existing `SelectionAst`, with no second semantic node family.
2. Add `@ontahi/language-codemirror` as a non-React CodeMirror 6 adapter with the language support,
   minimal highlighting, and lint-marker projection for the two diagnostic channels.
3. Add a small React host component in `@ontahi/explorer-react` that:
   - maps `ExplorerEntityDetail` into the headless reflection input;
   - owns the CodeMirror lifecycle and accessible label;
   - exposes the current valid Selection separately from the draft document and diagnostics.
4. Add an opt-in Entity Data proof mode. In that mode:
   - empty input is host behavior for `all`;
   - valid input creates a version-1 Graph Read request in `run` mode with the lowered Selection,
     no View, no ordering, and a fixed limit of 25;
   - execution uses the configured `RuntimeTransport` and existing `graph.read` family;
   - the table uses reflected columns and shows that the result is intentionally limited to the
     first 25 matches;
   - invalid drafts do not execute and leave the last successful rows visible.
5. Enable the experimental mode only in the Todo Explorer and demonstrate `completed = false`.
6. Keep syntax diagnostics, semantic diagnostics, and Runtime Protocol/execution failure in
   distinct state and presentation paths.
7. Follow the new-package checklist, add release Changesets for public package changes, and add
   focused package/import tests.

## Non-Goals

1. No `and`, `or`, `not`, parentheses, `all`, `none`, numbers, strings, comparisons, `in`, or
   `is null`; Plan 118b owns expression coverage.
2. No Entity-qualified `TodoItem where ...` form; Explorer already provides the Entity context.
3. No autocomplete, hover, semantic highlighting, dynamic values, or widgets.
4. No parser/printer round trip, formatting, saved drafts, or AST editor.
5. No relation predicate, Ref literal, date literal, Query clause, operation command, or natural
   language interpretation.
6. No conversion to `ReflectedEntityDataFilter` and no new filtering endpoint.
7. No redesign of Explorer's ordinary search/filter/sort/pagination toolbar. Experimental mode may
   omit those Query-shaping controls rather than imply that they are Selection syntax.
8. No Core Selection, Query, Graph Read protocol, or provider algebra change.

## Proposed Form

Illustrative service boundary:

```ts
const analysis = analyzeSelectionDocument('completed = false', {
  entity: {
    name: 'TodoItem',
    fields: [{ name: 'completed', type: 'boolean', nullable: false }],
  },
});

analysis.selection;
// {
//   kind: 'selection',
//   entityName: 'TodoItem',
//   expression: {
//     kind: 'predicate',
//     fieldName: 'completed',
//     operator: 'eq',
//     value: false,
//   },
// }
```

The exact API may change during implementation. It must preserve the result boundaries and may not
expose a second semantic predicate type.

## Acceptance Checklist

- [x] Parsing `completed = false` produces a recovered syntax tree with stable source ranges and no
      diagnostics.
- [x] `completed =` produces a syntax diagnostic at the missing value and no Selection.
- [x] `missing = false` produces a semantic unknown-Field diagnostic and no Selection.
- [x] `title = false` parses but produces a semantic type diagnostic and no Selection.
- [x] Valid input lowers exactly to the existing `SelectionAst` shown above.
- [x] The language package has no React, Explorer, CodeMirror, storage-adapter, or Runtime Transport
      dependency.
- [x] The CodeMirror package has no Explorer or React dependency and delegates all semantic results
      to the headless service.
- [x] Todo Explorer shows the expression input above TodoItem data and returns only incomplete
      items through a `graph.read` request.
- [x] A request-level test proves the filter was not sent as `ReflectedEntityDataFilter` and no
      `/explorer/entities` filter request implements the expression.
- [x] Invalid draft text does not execute, and an access/transport/runtime failure is not rendered
      as a syntax or semantic diagnostic.
- [x] Existing Explorer mode remains unchanged when the experiment is not enabled.
- [x] Public package exports, type declarations, licenses/notices, Changesets, and clean artifact
      installation pass repository checks.

## Verification

1. Run focused parser/lowering tests in `@ontahi/language`.
2. Run CodeMirror adapter tests for document updates and lint ranges.
3. Run Explorer component tests with a recording Runtime Transport and with syntax, semantic, and
   execution failures.
4. Run the Todo browser proof and assert visible incomplete rows plus a recorded `graph.read`
   request body.
5. Run affected-package typecheck, lint, test, build, repository format check, Changeset status,
   and package artifact verification.

## Exit Gate

Plan 118b may start only after the demo and tests prove that document state, recoverable syntax,
canonical Selection meaning, and runtime execution are four distinct boundaries. If the proof
requires a second filter AST or an Explorer-owned parser, stop and reshape the boundary before
adding grammar.

## Delivery Evidence

1. `@ontahi/language` owns the generated Lezer parser, recoverable source-positioned syntax,
   structural Entity analysis, stable syntax/semantic diagnostic codes, and exact lowering to the
   existing Selection AST.
2. `@ontahi/language-codemirror` installs the same parser as CodeMirror language support and maps
   headless diagnostics to lint ranges without importing Explorer or React.
3. Explorer owns the controlled CodeMirror host and an opt-in Entity Data panel. TodoItem enables
   it with `completed = false`; other Todo Entities retain the existing panel.
4. A recording Runtime Transport test asserts the versioned `graph.read` envelope, `run` mode,
   empty ordering, fixed limit 25, and canonical Boolean `eq` Selection. Invalid drafts send no
   request and retain the last successful rows; protocol rejection renders only as execution state.
5. Local browser evidence showed three rows for `completed = false`, preserved those rows for the
   incomplete `completed =`, and showed one row after `completed = true`, with no console errors.
6. Focused language coverage reached 97.43% lines / 85% branches; the CodeMirror adapter reached
   100% lines and branches. All 13 package test suites, Todo's 60 tests, repository typecheck and
   lint, Todo's production build, Changeset status, and clean-room artifact verification passed.

## Closure / Evolution

Completed on 2026-09-07. The four required boundaries—document, recoverable syntax, canonical
Selection, and execution—are independently observable and tested. Plan 118b may extend the grammar
without changing Explorer ownership or introducing a second filter model.
