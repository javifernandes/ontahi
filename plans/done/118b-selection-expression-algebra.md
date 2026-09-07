# 118b. Selection Expression Algebra

Status: done

Canonical ID: `ontahi://plans/118b-selection-expression-algebra`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118a Explorer Selection Language Walking Skeleton](../done/118a-explorer-selection-language-walking-skeleton.md)

Followed by: [118c Reflection-Powered Selection Language Service](118c-reflection-powered-selection-language-service.md)

## Architectural Question

Can contextual text express the established scalar and Boolean Selection algebra without losing
semantic meaning, adding syntax-only grouping to the canonical AST, or accidentally importing
Query shaping?

## Summary

Extend the proven language service from one Boolean equality to the smallest useful textual
projection of the current Selection algebra:

```text
completed = false and priority > 2
not archived = true
(status = "open" or status = "blocked") and priority >= 2
```

The Lezer syntax tree retains parentheses and source ranges. Semantic lowering uses only the
existing `SelectionExpression` nodes and their existing normalization behavior.

## Scope

1. Add `all`, `none`, `and`, `or`, prefix `not`, and parentheses with documented precedence:
   parentheses, `not`, `and`, then `or`.
2. Add the established scalar operator spellings:
   - `=` → `eq`;
   - `in [value, ...]` → `in`;
   - `is null` → `isNull`;
   - `<`, `<=`, `>`, `>=` → `lt`, `lte`, `gt`, `gte`.
3. Add quoted JSON string, finite number, Boolean, and bracketed list literal syntax needed by
   those operators. Use `is null` for null membership rather than introducing `= null`. Reject
   non-JSON-safe or non-finite values before lowering.
4. Define and test the initial semantic compatibility matrix:
   - `=` and `in` for Boolean, number, string, id, and enum Fields when literal types agree;
   - `is null` only for reflected nullable Fields;
   - ordering comparisons for number Fields only in this slice.
5. Keep dates, datetimes, JSON, Reference Fields, and relation predicates unsupported with precise
   semantic diagnostics; their portable syntax or cross-provider semantics are not yet settled.
6. Lower recursively through Core's existing `selectionAnd`, `selectionOr`, and `selectionNot`
   behavior. Do not add grouping or precedence nodes to the canonical AST.
7. Add parser, semantic, lowering, and runtime fixtures that cover precedence, nesting, `all`,
   `none`, every supported operator, invalid literal types, and recovered incomplete groups.
8. Extend the Explorer proof only enough to execute the new valid expressions through the same
   Graph Read path established by Plan 118a.

## Non-Goals

1. No Query shaping, Entity-qualified document, field path, relation traversal, Ref lookup, or
   named/saved Selection.
2. No autocomplete, hover, dynamic value lookup, formatter, printer, or widgets.
3. No new Selection operator and no `!=`, `not in`, or `is not null` canonical nodes; users may
   express their current meaning through `not`.
4. No promise to reproduce original whitespace or parentheses from a Selection AST. The document
   syntax tree already preserves those authorial details.
5. No broad Field-system validation redesign. If a proposed operator matrix contradicts actual
   provider behavior, narrow this slice and record the missing Core contract instead of encoding a
   language-only fiction.

## Acceptance Checklist

- [x] Grammar fixtures recover usefully from a missing operand, unmatched parenthesis, incomplete
      list, and missing value while retaining precise ranges.
- [x] Precedence fixtures lower `not a = true and b = true or c = true` exactly as documented.
- [x] Every supported spelling lowers to the corresponding existing Selection operator.
- [x] Boolean composition lowers only to existing `and`, `or`, and `not` nodes; parentheses never
      appear in `SelectionAst`.
- [x] Semantic diagnostics identify the exact Field/operator/value range for unknown Fields,
      incompatible values, non-null Fields using `is null`, and comparisons on unsupported types.
- [x] Valid nested expressions survive canonical Graph Read transport and execute in the in-memory
      runtime plus one external adapter already supporting the same operators.
- [x] Explorer still sends one canonical Graph Read request and does not reconstruct ad hoc filters.
- [x] Date, datetime, JSON, Reference, and relation expressions fail explicitly rather than lower
      approximately.

## Verification

1. Table-driven parser and lowering fixtures for every grammar production and recovery point.
2. Exact `SelectionAst` assertions for precedence and recursive compositions.
3. Cross-runtime behavioral assertions for the supported compatibility matrix.
4. Focused Explorer integration tests plus affected-package typecheck, lint, test, build, format,
   Changeset, and artifact checks.

## Exit Gate

Plan 118c may start when all supported expressions lower without a second semantic model and the
document syntax tree demonstrably retains the authorial information omitted by canonical
normalization. Any unresolved provider/type mismatch becomes a focused Core follow-up, not an
editor heuristic.

## Delivery Evidence

1. The generated Lezer grammar now covers `all`, `none`, Boolean composition, parentheses, scalar
   predicates, JSON strings, finite numbers, Booleans, and lists. Contextual keyword specialization
   preserves identifiers such as `note`, `notable`, and `trueish`.
2. `@ontahi/language` exposes recoverable, source-positioned syntax while recursively lowering
   valid meaning only through Core's existing Selection constructors. Parentheses remain syntax;
   Core normalization remains canonical.
3. Semantic analysis uses structural reflection to enforce the initial operator/type matrix,
   enum membership, nullability, finite numbers, and explicit rejection of date, datetime, JSON,
   Reference, and relation expressions.
4. Tests prove exact precedence, every supported operator, incomplete-document recovery, multiple
   semantic diagnostics, canonical in-memory execution, and compilation through the Supabase
   adapter. Explorer sends the resulting nested Selection in one `graph.read` request.
5. `@ontahi/language` has 44 passing focused tests with 97.57% statements, 90.79% branches, 100%
   functions, and 98.57% lines. `@ontahi/language-codemirror` has 3 passing tests and 100% coverage.
6. All 13 package suites, repository format/lint/typecheck/build, Changeset status, Todo's 60 tests
   and production build, and clean-room package artifact installation/type/runtime checks passed.

## Closure / Evolution

Completed on 2026-09-07. Text now expresses the established scalar and Boolean Selection algebra
without adding a semantic grouping node or a parallel filter model. Plan 118c can add
reflection-powered language assistance on top of this stable syntax/semantic boundary.
