# TypeScript and JavaScript code style

## Functions and composition

- Prefer top-level arrow functions over function declarations.
- Keep functions pure when practical.
- Prefer a direct expression over a local variable used only once when readability remains clear.
- Split large functions into focused, testable units.
- When a file carries several responsibilities, turn it into a folder of cohesive modules with a
  small public entrypoint. Do not fragment code merely to reduce line counts.

## Built-in APIs

- Use `String#replaceAll(...)` for global replacements.
- Prefer `Number.parseInt(...)` and `Number.parseFloat(...)` over their global counterparts.
- Prefer `String.raw` for backslash-heavy literals such as regular expressions and generated code.

## Generic data helpers

- Before defining a generic helper for objects, arrays, strings, JSON, or another common data
  structure, search the repository and prefer extending the corresponding module under
  `packages/core/src/value`.
- Organize shared helpers by data structure or value concept, such as `value/object` and
  `value/json`; do not accumulate unrelated functions in a catch-all `utils.ts`.
- Keep a helper local when its semantics belong to the surrounding domain rather than to the data
  structure itself.
- Give promoted helpers focused unit tests and import them through a public package export from
  consuming packages.

## Boundaries

- Keep `@ontahi/core` technology-independent. Provider, transport, framework, and UI concerns
  belong in focused packages.
- Import packages only through their public exports in consumer proofs and examples.
- Generated browser modules must not import server-only declarations.
- Avoid a new abstraction that merely renames an existing Ontahi concept.

## Errors and diagnostics

- Return or throw diagnostics at the boundary that has enough context to make them actionable.
- Preserve stable diagnostic codes when callers or tests depend on them.
- Avoid swallowing errors or replacing a precise failure with a generic one.
