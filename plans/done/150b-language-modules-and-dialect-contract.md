# 150b. Language Modules and Dialect Contract

Status: done

Canonical ID: `ontahi://plans/150b-language-modules-and-dialect-contract`

Related: [150](../current/150-ontahi-devtools-semantic-console.md),
[120b](120b-contextual-selection-factories.md).

## Intent and scope

Replace the 2610-line language entrypoint with cohesive model, Selection, Console, reflection and
dialect modules. Keep the public entrypoint as exports. Preserve public signatures, diagnostics,
source ranges, canonical requests, completion choices, rich editor controls and table edit behavior.

Keep the serializable `ts`/`declarative` identifier at settings/API boundaries. Internally resolve it
to a Dialect object that owns parser configuration, cursor interpretation, printing and spelling.
Semantic resolution, candidates, permissions and lowering stay shared. Avoid cyclic dependencies
through the public barrel, and do not create per-dialect semantic implementations.

## Slices and acceptance

- [x] Move existing behavior into cohesive modules and colocate their tests.
- [x] Introduce exercised dialect implementations behind a small contract and registry.
- [x] Preserve all public exports and prove equal behavior through existing plus contract tests.
- [x] Preserve source-backed edits, incomplete drafts, switching and editor history downstream.
- [x] Verify builds, typechecks, lint, formatting and installed artifacts.

## Deferred

Interleaved source filters/navigation and an ordered authoring pipeline are the next behavior slice,
not this refactor. Runtime-backed candidate reads live in
[118f](../backlog/118f-context-aware-reference-assistance.md); dynamic profiles remain in
[126](../research/126-ontahi-runtime-data-reflection.md). Do not add Commands or change `.one()`
terminal semantics here. No public custom-dialect registration framework is required by this proof.

## Closure — 2026-09-12

The entrypoint is 73 lines of exports. Cohesive modules now own source contracts, Selection syntax,
resolution, cursor/assistance/annotations, reflection projection, Console analysis/context/factories,
edits and dialect strategies. Internal imports no longer route through the public barrel.

TS and declarative strategies participate in parsing, conversion, completion and source edits.
Semantic continuation candidates have no dialect punctuation; each strategy renders them. Shared
analysis retains cardinality, target resolution, canonical lowering and capability filtering.
Serializable public dialect IDs and all supported public signatures remain unchanged.

Validation: 296 language tests (289 existing and 7 dialect-contract cases), 68 CodeMirror tests and
102 Devtools tests passed. Language coverage reported 98.5% lines and 91.25% branches. Language,
CodeMirror and Devtools builds passed; all package and example typechecks, language lint, repository
formatting and clean-room tarball installation/type/runtime checks passed. Existing mounted editor
tests exercise recovery/deletion, conversion/history, rich controls and table-driven edits.

An empty Changeset records that this structural change adds no consumer-visible behavior. Related
contextual navigation behavior predates this refactor and retains its own Changesets and Plan 120b.
Reference candidate execution and dynamic profiles remain deferred to 118f and 126; the semantic
distinction between same-Entity restriction and relation-derived navigation is recorded in 120b.
