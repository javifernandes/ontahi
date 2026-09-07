# 118d. Projectional Selection Editor Experiment

Status: backlog

Canonical ID: `ontahi://plans/118d-projectional-selection-editor-experiment`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118c Reflection-Powered Selection Language Service](./118c-reflection-powered-selection-language-service.md)

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

- [ ] The widget is derived only for a syntactically complete, semantically resolved enum literal.
- [ ] Selecting a value changes the underlying quoted text, reparses, and lowers to the expected
      existing `eq` or `in` predicate.
- [ ] Undo and redo traverse the widget-originated change as an ordinary document edit.
- [ ] Copying the expression produces valid text, not a widget label or hidden object payload.
- [ ] Deleting or partially editing the range removes the widget and exposes recoverable syntax
      with ordinary diagnostics.
- [ ] Keyboard-only users can enter, operate, leave, reveal, and delete the projection without a
      pointer; screen-reader output has an explicit tested label/value path.
- [ ] Switching Entity reflection or editing the Field removes stale choices immediately.
- [ ] The headless language service and canonical Selection AST contain no decoration or widget
      types.
- [ ] The plan records whether CodeMirror replacement decorations are sufficient before any date,
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
