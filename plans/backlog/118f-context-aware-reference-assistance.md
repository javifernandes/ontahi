# 118f. Context-Aware Reference Assistance

Status: backlog

Canonical ID: `ontahi://plans/118f-context-aware-reference-assistance`

Builds on [118e](../current/118e-runtime-backed-reference-value-projections.md) and consumes the
authority-aware profiles researched in [126](../research/126-ontahi-runtime-data-reflection.md).
Related: [150](../current/150-ontahi-devtools-semantic-console.md),
[120b](../done/120b-contextual-selection-factories.md),
[119](119-selection-relation-predicates.md).

## Intent

Choose a Reference value as an Entity instance, displaying its label while preserving canonical
identity in source. Support Console and Explorer through one headless context contract and an
optional authorized host provider. Adapt enumeration versus typeahead to runtime facts, not static
widget declarations or hardcoded assumptions about an Entity's size.

## Motivating cases (future authoring, not newly supported syntax)

`TodoItem.where(list = |)` can search authorized TodoLists. In
`TodoItem.where(title = "Something" and list = |)`, an optional contextual mode can restrict choices
to distinct lists related to items satisfying the completed constraints. Use `title`, the actual
TodoItem Field; no new `name` Field or `.and().where(...)` syntax is implied.

This is a read over a derived candidate Selection, not permission to execute an incomplete query.
Distinguish **allowed references** from **references that yield current matches**: the latter are
data-dependent assistance, not intrinsic validity. A valid reference with zero matches remains
manually authorable. Do not apply the distinction silently or claim an incomplete page is exhaustive.

## Slices

1. Reuse 118e identity resolution, display labels, cancellation and source-preserving edits in both
   Console dialects. Expose a value hole and its semantic source context without I/O in language.
2. Define candidate derivation over the canonical model, retaining context across contextual hops.
   Specify `and`, `or`, `not`, repeated fields, Reference `in`, invalid siblings and nested groups.
   Never drop constraints by slicing text before the cursor. Unresolvable contexts must report that
   contextual narrowing is unavailable; any general search fallback must be explicit.
3. Execute a bounded candidate query through existing authorized runtime boundaries: distinct target
   identities, target labels, limits, pagination and optional prefix search, without fetching all
   source rows client-side. Every source, relation, target and aggregate obeys current authority.
4. Consume 126 population quality, enumeration/search support and cost to choose a combo for small
   enumerable sets or typeahead for larger/unknown populations. Avoid exact counts on every keypress.

## Acceptance

- [ ] Source contains only canonical Reference identity, never mutable display labels.
- [ ] Both dialects and Explorer derive the same candidate context and meanings.
- [ ] Contextual suggestions reflect completed constraints and preserve Boolean grouping.
- [ ] Suggestions cannot reveal unauthorized rows, relation existence, counts or distributions.
- [ ] Missing capability, stale estimates, partial pages and errors remain explicit.
- [ ] Debounce, cancellation, bounded work and stale reply rejection cover document, Entity,
      authority, transport and route changes. Cache keys include the constrained Selection and scope.
- [ ] No implicit Query execution during parsing, no writes, and no provider-specific UI shortcut.
- [ ] Small/large/unknown populations and manual zero-match references have executable UI proofs.

## Non-goals

No implementation during the language refactor; no automatic full-population scans, new universal
query protocol, global counts, authorization inferred from suggestions, or mandatory exact counts.
Treat adaptive presentation and candidate execution as separate consumers of runtime facts.
