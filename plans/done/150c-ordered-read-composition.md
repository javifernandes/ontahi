# 150c. Ordered Read Composition

Status: done

Canonical ID: `ontahi://plans/150c-ordered-read-composition`

Builds on [150b](150b-language-modules-and-dialect-contract.md) and
[120b](120b-contextual-selection-factories.md).

## Scope

Support source filters, contextual navigation and target filters as ordered authoring stages in
both dialects. Each filter intersects the current Selection; each navigation constructs the existing
relation-image over that Selection and changes the current Entity. No stage executes a read.

```text
TodoList.where(name = "Later").openItems.where(completed = false).many()
TodoList where name = "Later" through openItems where completed = false many
```

Preserve root named factories, source ranges, conversion, target sorting/limits and editor history.
Repeated filters mean intersection. Read modifiers and terminals remain at the end; `.one()` is
not an intermediate cardinality assertion. Named factories after navigation, raw relations,
parameterized contextual factories and dynamic Reference assistance remain deferred.

## Acceptance

- [x] Ordered source syntax lowers to the existing canonical nested Selection AST.
- [x] Both dialects preserve stage order, diagnostics and incomplete-draft recovery.
- [x] Completion and rich controls resolve the Entity at each filter, not only the final target.
- [x] Conversion and table edits preserve every stage; invalid prefixes never become target-only reads.
- [x] Tests exercise mixed stages, nested hops, negative cases and real runtime membership.
- [x] Validate affected builds, tests, typechecks, lint, formatting and packed consumers.

## Closure — 2026-09-12

Source syntax exposes ordered `steps`; existing factory/navigation collections and final-filter
fields remain compatibility projections. Both dialects share sequential lowering over the current
membership and Entity. Read modifiers are inserted after the last membership stage. Rich widgets
retain independent source/target Entity contexts and ordinary undo/redo.

326 language tests, 70 CodeMirror tests and 103 Devtools tests passed. Tests compare nested canonical
membership with SDK composition, recover every pipeline prefix, reject invalid source stages,
preserve exact conversion/stage order, and edit source and target values independently. Language
coverage: 98.66% lines, 91.14% branches.

Devtools executes source-constrained membership through the real in-memory dispatcher, retains it
through dialect/table edits and returns no target rows when the source does not match. Clean-room
tarball verification executes root factory + source filter + contextual hop + target filter and
checks that contradictory source predicates produce an empty result. Affected builds, package and
example typechecks, affected lint, repository formatting and installed-artifact checks passed.

No Core/protocol/provider changes were needed. Commands, intermediate cardinality assertions,
factories after filters/navigation, contextual parameters and runtime-backed Reference assistance
remain explicitly outside this slice.
