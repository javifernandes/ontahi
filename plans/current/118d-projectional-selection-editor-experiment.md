# 118d. Projectional Selection Editor Experiment

Status: current

Canonical ID: `ontahi://plans/118d-projectional-selection-editor-experiment`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118c Reflection-Powered Selection Language Service](../done/118c-reflection-powered-selection-language-service.md)

## Architectural Question

Can CodeMirror add a useful typed visual projection to a resolved Selection value while the text
document remains the only editable source and ordinary keyboard, undo, copy, diagnostics, and
lowering behavior remain truthful?

## Summary

Add one intentionally small hybrid-editing experiment for a finite reflected value. For example:

```text
status = [ Open ▾ ]
```

The visible control is a CodeMirror decoration over the resolved string literal. Choosing another
value dispatches a text edit, which reparses and re-resolves through the existing language service.
There is no widget-owned semantic Selection state.

Use an enum Field for the primary experiment because its choices are finite in static reflection.
A Boolean toggle may be included only if it does not expand the interaction model. Dates and Refs
remain deferred because their encoding and runtime lookup introduce different risks.

The executable Todo domain has no Entity enum Field. The first host demonstration therefore uses
the existing `TodoItem.completed` Boolean as a two-choice finite projection, while adapter tests
exercise the same mechanism with enum reflection. This keeps the experiment focused on reversible
projection behavior instead of expanding the example domain solely to manufacture a demo value.

## Scope

1. Add a CodeMirror replacement decoration backed by the resolved enum-literal range and expose
   the same range as atomic for cursor motion.
2. Make widget changes dispatch ordinary document transactions containing canonical textual enum
   literals.
3. Provide a deliberate way to reveal/edit the underlying text for keyboard-only use, correction,
   copy/paste, or unsupported assistive technology.
4. Preserve syntax and semantic diagnostics around and inside neighboring expressions.
5. Define focus transfer, Escape, arrow-key, Enter/Space, deletion, selection, clipboard, and IME
   behavior for the experimental control.
6. Keep decoration state derived from the current document, syntax tree, reflection, and semantic
   resolution. Destroy stale widgets when any input changes.
7. Compare the outcome with the same interaction implemented as ordinary completion only and record
   whether the widget materially improves the task.
8. Record a concrete continue/reshape/stop decision for CodeMirror as the projectional foundation.

## Non-Goals

1. No universal widget registry, design system, visual query builder, drag-and-drop AST, or
   synchronized second editor.
2. No date picker, Ref picker, runtime value search, relation editor, or nested group UI.
3. No serialization of widget state and no widget identifier in Selection AST.
4. No requirement that every enum literal render as a widget; projection remains a host/editor
   policy.
5. No claim of complete accessibility from DOM rendering alone. The acceptance path must be tested.

## Acceptance Checklist

- [x] The widget is derived only for a syntactically complete, semantically resolved finite literal.
- [x] Selecting a value changes the underlying quoted text, reparses, and lowers to the expected
      existing `eq` or `in` predicate.
- [x] Undo and redo traverse the widget-originated change as an ordinary document edit.
- [x] Copying the expression produces valid text, not a widget label or hidden object payload.
- [x] Deleting or partially editing the range removes the widget and exposes recoverable syntax
      with ordinary diagnostics.
- [ ] Keyboard-only users can enter, operate, leave, reveal, and delete the projection without a
      pointer; screen-reader output has an explicit tested label/value path.
- [x] Switching Entity reflection or editing the Field removes stale choices immediately.
- [x] The headless language service and canonical Selection AST contain no decoration or widget
      types.
- [x] The plan records whether CodeMirror replacement decorations are sufficient before any date,
      Ref, or structural-group widget plan is created.

## Verification

1. CodeMirror unit tests for decoration derivation, transactions, stale removal, and atomic ranges.
2. Browser interaction tests for pointer, keyboard, undo/redo, selection, clipboard, and diagnostic
   recovery.
3. Accessibility checks with semantic roles/names plus one manual screen-reader pass documented in
   delivery evidence.
4. Exact text and Selection AST assertions before and after every widget action.
5. A Todo Explorer demonstration plus affected-package typecheck, lint, test, build, format,
   Changeset, and artifact checks.

## Exit Gate

Do not plan richer projectional editing until this experiment shows that a widget can remain a
reversible projection over text. If CodeMirror cannot preserve the acceptance path, retain the
headless language service and replace only the editor adapter; do not redesign Selection.

## Delivery Evidence

The adapter derives Boolean and enum controls from resolved syntax ranges and exposes them only when
the host opts in. Explorer enables the experiment for its Selection editor; the executable Todo
proof therefore projects `TodoItem.completed` without adding a demonstration-only enum to the
domain. Choosing a control value, including a member of an `in` list, replaces the source literal
and reparses through the existing language service.

CodeMirror DOM tests cover finite derivation, `eq` and `in` transactions, canonical Selection
lowering, atomic cursor motion, native focus, source-text copy, undo/redo, Escape reveal,
Backspace/Delete recovery, and stale reflection removal. A manual browser pass on Todo Explorer
confirmed the Boolean control, Graph Read result changes, undo, source reveal, and recoverable
diagnostics. The control exposes the accessible name `Value for <Entity>.<Field>`, its selected
native option, and keyboard shortcut metadata. A manual screen-reader pass remains before closure.

The provisional decision is to continue using CodeMirror replacement decorations for finite
values. They materially shorten a reflected finite-value edit while keeping document text,
history, diagnostics, lowering, and execution truthful. This evidence does not generalize to dates,
Refs, runtime-backed choices, or structural groups.

Verification on 2026-09-07:

1. `@ontahi/language-codemirror`: 18 tests; 98.77% statements, 86.25% branches, 98.11%
   functions, and 99.32% lines; typecheck, lint, and build passed.
2. `@ontahi/explorer-react`: 181 tests; typecheck, lint, coverage gate, and build passed.
3. Repository format and Changeset status passed.
4. All thirteen packages passed clean-room artifact install, type, and runtime verification.
5. Todo Explorer passed the manual pointer, keyboard, undo, Graph Read, and diagnostic-recovery
   browser path.
