# `@ontahi/language-codemirror`

CodeMirror 6 projection for the editor-neutral services in `@ontahi/language`.

```ts
import { selectionExpressionExtensions } from '@ontahi/language-codemirror';

const extensions = selectionExpressionExtensions(
  {
    name: 'TodoItem',
    fields: [{ name: 'completed', type: 'boolean', nullable: false }],
  },
  { finiteValueProjections: true },
);
```

The adapter owns CodeMirror language support, completion UI, syntax and semantic highlighting,
hover UI, and lint projection. Parsing, cursor context, reflection lookup, diagnostic meaning, and
lowering remain in `@ontahi/language`; Explorer and other hosts own editor lifecycle and execution.

Typing activates contextual suggestions; `Ctrl-Space` opens them explicitly. Field identifiers,
unsupported or unresolved names, operators, keywords, and values receive stable semantic classes.
Hovering a Field shows its reflected type/nullability and hovering an operator explains its
canonical Selection meaning. Reconfiguring the extension with another Entity discards the previous
reflection immediately.

Hosts may opt into finite-value projections. A complete, semantically resolved Boolean or enum
literal is then displayed as an accessible choice control while the source text remains the only
document state. Choosing a value dispatches a normal text transaction, so history and copy retain
ordinary CodeMirror behavior. Escape reveals and selects the source literal; Backspace or Delete on
the control removes it and restores normal recoverable diagnostics.

Hosts may also provide runtime-backed Reference values without moving queries into the language
service. Search options have a display label and a portable identity; accepting one writes only the
quoted identity into the document. A complete identity may resolve into a rich atomic value, while
failed, missing, denied, or stale resolution leaves the ordinary source text available:

```ts
selectionExpressionExtensions(entity, {
  referenceValues: {
    search: request => searchReferenceValues(request),
    resolve: request => resolveReferenceValue(request),
  },
});
```

Reference providers receive an `AbortSignal`. They own authority-safe runtime access, result limits,
and display labels. The adapter owns cancellation and stale-result rejection. Directly pasted
single-field identities are JSON-encoded into valid source before optional resolution.

The completion surface uses the host's `--popover`, `--border`, `--accent`, and related theme
variables with neutral fallbacks, so Explorer can integrate it without adapter-specific CSS.

Backspace is bound to CodeMirror's document command so deletion remains an ordinary transaction
even while a completion popup and semantic marks are active.

`consoleExpressionExtensions(application, { orderableFields })` forwards the host's optional
Entity-to-Field-name resolver to headless Console completion. Reconfigure the extension when the
capability snapshot changes to discard stale suggestions without editing source or history. The
adapter does not fetch permissions or change the Console linter's schema-based validation.
With `finiteValueProjections: true`, that same resolver supplies ordering Field dropdowns and
direction controls in TS and Declarative. Incomplete order clauses show a Field chooser; omitted
directions display the implicit ascending order without adding source text until changed. Choosing
an option edits only its source range, never executes, and supports undo/redo, Escape to reveal
source, and deletion. Without permitted Fields, ordering stays ordinary editable text.

## Console Dialects

`consoleExpressionExtensions(application, { dialect: 'declarative' })` selects declarative parsing,
highlighting, completion, lint, and optional Boolean/enum controls. The default remains `ts`.
`consoleExpressionLanguageSupport(dialect)` and `deriveConsoleFiniteValueProjections(document,
application, dialect)` also accept the dialect explicitly.

The adapter stores the current dialect in `consoleExpressionDialect`. After validating/converting
the current document with the headless language service, dispatch its text changes and
`setConsoleExpressionDialect.of(targetDialect)` together as one isolated history transaction.
With CodeMirror history installed, undo/redo restores both the source and parser; the original
whitespace is restored, not regenerated from a canonical request. Switching performs no execution.
When reconfiguring application/capability options, pass the current dialect from the state field.
The state effect configures the editor; validation/conversion and any Run action remain host-owned.

## Browser Authoring Preference And Colors

`authoringDialectPreference` exposes `getSnapshot()`, `getServerSnapshot()`, `subscribe(listener)`,
and `set('ts' | 'declarative' | undefined)` for browser hosts. It persists under
`ontahi.authoring.dialect`, notifies same-origin tabs and editors, and falls back to page-local state
if storage is restricted. `undefined` clears the preference. Server calls are inert and return
`undefined`; this is not runtime authority or server-owned user data. React hosts can consume it
with `useSyncExternalStore`. The extension itself does not silently rewrite documents: hosts own
safe conversion, explicit overrides, and incomplete-draft handling.

Both Selection and Console extensions accept `colorScheme: 'light' | 'dark'` (default `light`).
Reconfigure it when the host theme changes. Dedicated token palettes replace generic highlighting;
keyword/function, Entity, Field, operator, string, and literal colors are contrast-tested against
the default light/dark editor surfaces. Finite-value projections and source text remain unchanged.
