# 118e. Runtime-Backed Reference Value Projections

Status: current

Canonical ID: `ontahi://plans/118e-runtime-backed-reference-value-projections`

Shapes: [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)

Depends on: [118d Projectional Selection Editor Experiment](118d-projectional-selection-editor-experiment.md)

Related plan: [126 Ontahí Runtime Data Reflection](../research/126-ontahi-runtime-data-reflection.md)

## Architectural Question

Can a contextual Selection document store a portable Reference identity while an authorized host
searches and resolves richer target labels, without moving runtime data into the headless language
service or making the visual label a second source of truth?

## Summary

Support Reference Field equality through an identity literal:

```text
list = "list-inbox"
```

Semantic analysis reconstructs a canonical `TodoList` Ref from the reflected single-field identity.
The text remains independently pasteable and executable. When Explorer has an authorized reflected
Entity data reader, CodeMirror may search TodoList and project the literal as a richer
`Inbox · list-inbox` value. Search results and labels are disposable runtime presentation.

## Scope

1. Extend narrow language reflection with Reference target and single-field identity metadata.
2. Admit quoted identity literals for `=` and `in`, plus `is null` for nullable Reference Fields,
   and lower them to the existing canonical Entity Ref value.
3. Keep composite identities unsupported with a precise semantic diagnostic in this slice.
4. Expose editor-neutral Reference value context without performing a runtime query.
5. Add an optional CodeMirror Reference value provider for asynchronous search and exact identity
   resolution, with cancellation and stale-result protection.
6. Write only the quoted identity into the document when an option is selected; rich display labels
   never enter Selection text or AST.
7. Let a pasted or manually authored identity resolve into a rich projection when possible and
   remain ordinary editable text when unavailable, missing, or denied.
8. Back Explorer's provider with its existing authority-aware `ReflectedEntityDataReader` rather
   than a provider-specific query or new runtime endpoint.

## Non-Goals

1. No Relation predicates, target-field paths, joins, `include`, or automatic relation traversal.
2. No composite Reference locator authoring or arbitrary JSON locator syntax.
3. No date/datetime syntax, string-search Selection operator, Query shaping, or saved document.
4. No claim that runtime search is always enumerable, cheap, indexed, or authorized.
5. No runtime query from `@ontahi/language`; dynamic behavior remains an optional host capability.

## Acceptance Checklist

- [x] `list = "list-inbox"` lowers to an `eq` predicate containing a canonical TodoList Ref.
- [x] Reference `in` lists and nullable `is null` preserve the existing Selection operator model.
- [x] Unknown, incomplete, and composite identity metadata fail explicitly without approximate
      lowering.
- [x] Root, operator, and value completion remain useful without a runtime provider.
- [x] Authorized search options show reflected display text and write only the identity literal.
- [x] Pasting or typing a known identity resolves to the same rich presentation as selecting it.
- [x] A missing, denied, failed, or stale resolution leaves valid source text usable and visible.
- [x] Switching Entity reflection aborts or discards old Reference search and label results.
- [x] Copy, undo, Escape/source reveal, deletion, and diagnostics remain ordinary document behavior.

## Verification

1. Headless parser, semantic, lowering, and completion fixtures for single-field Reference identity.
2. CodeMirror tests for search, selection, resolution, stale cancellation, source reveal, and
   fallback behavior.
3. Explorer tests proving queries use the existing reflected Entity reader and target reflection.
4. A Todo browser journey for `TodoItem.list` plus affected-package typecheck, lint, coverage,
   build, format, Changeset, and package artifact checks.

## Exit Gate

Dates or richer runtime-backed controls wait until a Reference identity can remain truthful through
search, direct paste, failed resolution, source reveal, and authorized Graph Read execution.

## Delivery Evidence

The headless language service accepts single-field Reference identities for `=`, `in`, and nullable
`is null`, and lowers quoted identities to the existing canonical Entity Ref shape. It exposes only
the static Reference value context; runtime search and resolution remain an optional CodeMirror host
provider. Missing or composite identity reflection produces an explicit semantic diagnostic.

CodeMirror tests cover asynchronous search, completion acceptance, direct and quoted paste, rich
resolution, denied/missing fallback, stale document and Entity cancellation, copy, deletion, undo,
source reveal, and nested/list projections. Explorer adapts its existing authority-aware reflected
Entity reader for search and exact identity resolution, and reuses the same reflected display rules
for the projected value and Reference result cells.

A manual Todo Explorer browser pass authored `list = "in`, selected `Inbox · list-inbox`, observed
three matching rows, then selected `Later · list-later` and observed one matching row. Clicking the
rich value revealed the portable `"list-later"` source and reopened both choices. This pass also
found an incomplete-string replacement bug (`"in"list-inbox"`), which now has a regression test and
uses the current parsed Reference range when a delayed completion is accepted.

Verification on 2026-09-07:

1. `@ontahi/language`: 80 tests; 96.21% statements, 88.10% branches, 99.05% functions,
   and 97.71% lines; typecheck, lint, and build passed.
2. `@ontahi/language-codemirror`: 27 tests; 96.18% statements, 81.44% branches, 93.47%
   functions, and 98.70% lines; typecheck, lint, and build passed.
3. `@ontahi/explorer-react`: 184 tests; typecheck, lint, coverage gate, and build passed.
4. Todo Express passed 64 tests plus typecheck, lint, server build, and client build.
5. Repository format, Changeset status, diff whitespace, and all thirteen packages' clean-room
   artifact install, type, and runtime checks passed.
