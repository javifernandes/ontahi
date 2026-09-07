# 118. Ontahí Selection Language Editor Research

Status: done

Canonical ID: `ontahi://plans/118-ontahi-selection-language-editor`

Migrated from: `bookops://plans/118-ontahi-selection-language-editor`
Original path: `plans/research/118-ontahi-selection-language-editor.md`
Source commit: `a27ef5d1`

Related plans:

1. [116 Ontahí Selection Model](./116-ontahi-selection-model.md)
2. [117 Alive UI From Reflected Selections](../backlog/117-alive-ui-from-reflected-selections.md)
3. [76 Operation Input Metadata And UI](bookops://plans/76-operation-input-metadata-and-ui)
4. [118a Explorer Selection Language Walking Skeleton](./118a-explorer-selection-language-walking-skeleton.md)
5. [118b Selection Expression Algebra](../next/118b-selection-expression-algebra.md)
6. [118c Reflection-Powered Selection Language Service](../backlog/118c-reflection-powered-selection-language-service.md)
7. [118d Projectional Selection Editor Experiment](../backlog/118d-projectional-selection-editor-experiment.md)
8. [119 Selection Relation Predicates](../backlog/119-selection-relation-predicates.md)
9. [126 Ontahí Runtime Data Reflection](../research/126-ontahi-runtime-data-reflection.md)
10. [147 Application-Bound Headless Graph Reads](./147-application-bound-headless-graph-reads.md)

Shapes:

1. [Ontahí Semantic Interaction Language](../../atlas/items/semantic-interaction-language.md)
2. [Selection](../../atlas/items/model/selection.md)

## Summary

Shape a reusable Selection language editor whose portable meaning is Ontahí's canonical Selection
AST. Research editor frameworks, language tooling, interaction models, and integration boundaries,
then choose a narrow implementation path.

The intended artifact is not a React filter component. It is an editor or language-service
capability that Explorer can embed through an adapter and that other Ontahí applications can reuse
without adopting Explorer's UI implementation.

## Context

Ontahí now represents entity sets through one Selection algebra: `all`, `none`, `references`, field
predicates, and recursive `and` / `or` / `not`. Queries consume this membership language and add
read shaping; operations may accept the same Selection directly.

Explorer can currently author `None`, `All`, and reference-defined selections through a data-backed
picker. Comprehension remains available through the raw AST but has no dedicated authoring
experience.

Historically, visual filter builders become complex when they encounter typed values, nested
Boolean groups, relations, autocomplete, diagnostics, keyboard editing, accessibility, formatting,
and lossless round-tripping. A small React form should not accidentally freeze the language or
become a second AST.

The Selection AST is a semantic family-body value that Graph Reads and Commands can carry through
the [[ontahi.runtime-protocol|Ontahí Runtime Protocol]]. It is not the Runtime Protocol envelope's
AST, and the protocol should not own its grammar. The editor changes how a Selection is authored;
transport continues to carry the same canonical Selection meaning.

## Research / Evidence

### Current Main Implementation

The decision is grounded in `main` at `228e7fb`:

1. `packages/core/src/data-graph/selection-ast.ts` defines the canonical portable vocabulary:
   `all`, `none`, `references`, `eq`, `in`, `isNull`, `lt`, `lte`, `gt`, `gte`, and recursive
   `and` / `or` / `not`.
2. `packages/core/src/data-graph/selection-value.ts` wraps that representation as the public
   `Selection`; TypeScript builders are authoring syntax and `toAst()` / `toJSON()` emit the same
   portable meaning.
3. `packages/core/src/data-graph/query.ts` keeps membership in `selection` while adding projection,
   includes, ordering, limit, cardinality, and terminal read intent. A textual Selection grammar
   must not absorb those Query clauses.
4. `packages/core/src/data-graph/read-protocol.ts` already transports `SelectionAst` inside
   `GraphReadRequestV1`, resolves it against the server Entity registry, validates its structure,
   and rebuilds an ordinary Query. `read-dispatcher.ts` applies field/operator policy and
   authority scope before the configured runtime executes it.
5. Explorer's static Entity descriptors already expose field names, scalar types, value types,
   nullability, enum values, reference targets, identities, and relations. This is sufficient for
   the first syntax-to-semantic resolution without Plan 126's dynamic population profile.
6. Explorer Entity Data currently does not use Selection for its filter. Its
   `entity-data-browser.ts` builds a separate `ReflectedEntityDataQuery` with one
   `ReflectedEntityDataFilter`; the reader contract includes `contains`, which the canonical
   Selection algebra deliberately does not. The first proof must not lower into that side model.
7. `@ontahi/explorer-react` currently owns Monaco `0.55.1` and `@monaco-editor/react` for its raw
   JSON inspector; no package currently depends on Lezer or CodeMirror 6. Reusing Monaco would
   avoid a second editor dependency family, but that is not evidence that Explorer should own the
   Selection language.
8. `@ontahi/devtools` formats canonical Selection and Graph Read payloads for runtime inspection.
   It is a future consumer of richer language projections, not the parser or language-service
   owner.

### Technology Comparison

The comparison rubric prioritized recoverable incremental syntax, framework-neutral headless use,
semantic assistance, progressively projectional rendering, browser integration cost, accessibility
testability, and keeping editor types out of Ontahí's canonical model.

| Candidate                                   | Evidence against the rubric                                                                                                                                                                                                                                                                                                                                     | Decision                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lezer + CodeMirror 6                        | Lezer incrementally reuses syntax-tree fragments and performs error recovery. CodeMirror's language layer consumes Lezer trees directly; completion and lint sources may be synchronous or asynchronous; mark, widget, and replacement decorations plus atomic ranges can project semantic nodes while the document remains text.                               | Use for the POC. It gives the shortest honest path from recoverable syntax to a projectional experiment.                                                                    |
| Tree-sitter + a web editor                  | Tree-sitter also provides incremental, error-tolerant concrete syntax trees and JavaScript/Wasm bindings. It is strongest when a grammar must be shared with native tools or a broad parser ecosystem.                                                                                                                                                          | Defer. Ontahí has no native grammar consumer today, and the browser POC would add a Wasm/runtime and editor-adapter boundary without reducing the current risk.             |
| Monaco + custom parser/language integration | Monaco already ships in Explorer and supports completion providers, markers, semantic tokens, decorations, injected text, and positioned content widgets. Its official project page says mobile browsers and mobile web frameworks are unsupported. Content widgets are positioned near text rather than replacing a source range with an editor-native widget. | Do not use for the Selection POC. Reuse saves one dependency family but couples the durable editor to Explorer's raw-JSON choice and gives a less direct projectional path. |

Primary technical evidence:

1. [Lezer System Guide](https://lezer.codemirror.net/docs/guide/) and
   [Lezer Reference Manual](https://lezer.codemirror.net/docs/ref/)
2. [CodeMirror System Guide](https://codemirror.net/docs/guide/) and
   [CodeMirror Reference Manual](https://codemirror.net/docs/ref/)
3. [Tree-sitter Introduction](https://tree-sitter.github.io/tree-sitter/)
4. [Monaco project page](https://microsoft.github.io/monaco-editor/) and
   [Monaco editor API](https://microsoft.github.io/monaco-editor/typedoc/modules/editor_editor_api.editor.html)

Lezer and CodeMirror are implementation choices, not semantic dependencies of Core. The decision
must be revisited after the projectional experiment if replacement widgets, keyboard behavior, or
accessibility fail the acceptance path.

## Scope

1. Define the Selection editor as a durable Ontahí artifact and identify its package boundary.
2. Sketch simple, textual, structural, and hybrid authoring experiences.
3. Inventory the Selection AST capabilities the editor must preserve losslessly.
4. Compare viable editor and language-tooling frameworks.
5. Define parser, printer, completion, diagnostics, and AST synchronization responsibilities.
6. Define the minimal reflection required for fields, relations, operators, values, refs, and
   cardinality.
7. Recommend one narrow prototype that answers the riskiest open question.

## Non-Goals

1. Do not implement the editor during this research plan.
2. Do not add a second query or filter AST.
3. Do not make React the editor's architectural boundary.
4. Do not design saved-selection persistence, dashboards, widgets, or Alive UI policy here.
5. Do not require a complete textual grammar before the Selection AST is stable.
6. Do not treat query-only shaping such as projection, ordering, or pagination as Selection syntax.
7. Do not collapse Graph Schema, Model Expression, Selection, and Runtime Protocol into one
   canonical AST before a shared textual syntax has concrete evidence.

## Proposed Artifact Shape

```text
Editor engine ↔ text document
      ↑              ↓ incremental parse
editor adapter ← recoverable syntax tree + source positions
      ↑              ↓ resolve against Entity reflection
      └──── Selection language service
                         ├── typed completion
                         ├── diagnostics / hover
                         ├── semantic projections
                         └── lower valid meaning
                                      ↓
                           canonical Selection AST
                                      ↓
                         existing Query / Graph Read
```

The Selection AST remains canonical portable meaning. The text document and recoverable syntax
tree are not projections derived from the AST while a user types: they own source positions,
parentheses, trivia, incomplete input, and diagnostics. Text, structured controls, chips, and
visual groups lower to or present Selection meaning without adding a second semantic AST.

The first implementation proof is one end-to-end vertical slice in Explorer's Entity Data table:
an opt-in contextual `completed = false` expression for TodoItem, lowering to the canonical
Selection AST and execution through the existing `graph.read` Runtime Protocol path. It must not
translate back into `ReflectedEntityDataFilter`. Query shaping that the current toolbar also owns
may remain outside the proof rather than widening the language.

## Package And Ownership Decision

Use two boundaries from the first implementation:

1. `@ontahi/language` owns the generated Lezer parser, editor-neutral syntax traversal, a narrow
   reflected Entity input, syntax and semantic diagnostics, completion data, and lowering to the
   existing Core Selection types. Lezer nodes do not escape as semantic API.
2. `@ontahi/language-codemirror` owns CodeMirror language support, completion and lint adapters,
   highlighting, hover, and later decorations/widgets. It imports the headless package and has no
   Explorer or React dependency.
3. `@ontahi/explorer-react` owns a small React host component and Entity Data integration. It maps
   `ExplorerEntityDetail` to the language reflection input and supplies the configured Graph Read
   execution capability.
4. `@ontahi/core` keeps the canonical Selection, Query, reflection primitives, and Runtime
   Protocol. It does not import Lezer or CodeMirror.
5. `@ontahi/devtools` may consume resolved/canonical outputs for inspection but does not own the
   language service.

The package names may change before stable release, but the headless/editor split should not.
Keeping CodeMirror out of the default language package avoids making CLI, server, or future LLM
consumers install a DOM editor runtime.

An illustrative headless result is:

```ts
type SelectionAnalysis = {
  syntaxDiagnostics: readonly LanguageDiagnostic[];
  semanticDiagnostics: readonly LanguageDiagnostic[];
  selection?: SelectionAst;
};
```

`selection` is absent while syntax or semantic errors block lowering. Execution is invoked only by
the host and its errors remain a third channel; the service does not turn `access_denied` into an
unknown-Field diagnostic.

## UX Sketches To Compare

### Simple surface

```text
[ None ] [ Selected (2) ] [ Filter ] [ All ]

status      is          draft
createdAt   before      2026-01-01
Match: all conditions
```

This surface is approachable but must not imply that references and predicates can never compose.

### Assisted expression

```text
Book where status = "draft" and createdAt < 2026-01-01
           └ fields, operators, values, refs, and named selections autocomplete here
```

The editor should offer valid next tokens from entity reflection and preserve a valid or
diagnostically recoverable document while typing.

### Multiple synchronized projections

```text
Visual | Expression | AST
```

This is directional, not a requirement. Research must determine whether bidirectional
synchronization is understandable and technically honest or whether one projection should be
primary at a time.

## AST Stability Gates

Implementation confirms only the canonical vocabulary exercised by each slice:

1. Plan 118a uses the established `eq` predicate and `SelectionAst` envelope.
2. Plan 118b uses the established scalar predicates and recursive `and`, `or`, and `not`
   normalization.
3. `references`, locator literal syntax, relation predicates, named selections, and parameters do
   not block those slices and remain unsupported until their own semantics are ready.
4. Partial input, error recovery, source positions, parentheses, and authorial formatting remain
   outside the canonical AST in every slice.

The editor may prototype against an incomplete future algebra, but it must reject unsupported
syntax explicitly rather than encoding unstable assumptions as permanent UI structure.

## Execution Slices

### Slice 1: Language And Artifact Inventory

- [x] Inventory current Selection nodes, builders, reflection, validation, and provider lowering.
- [x] Separate canonical AST state from ephemeral editor/document state.
- [x] Identify unstable AST decisions that block honest editor research.

### Slice 2: UX Sketches

- [x] Sketch reference selection, one typed predicate, multiple conditions, nested groups, negation,
      and mixed refs/predicates.
- [x] Sketch keyboard, autocomplete, error recovery, and accessible navigation behavior.
- [x] Compare simple, textual, structural, and hybrid projections.

### Slice 3: Framework Research

- [x] Define a comparison rubric before evaluating libraries.
- [x] Compare editor engines and parsing/language-service options against the rubric.
- [x] Record portability, accessibility risk, extensibility, licensing, and maintenance evidence.
- [x] Determine whether Monaco reuse is an advantage or accidental coupling.

### Slice 4: Recommendation

- [x] Recommend an artifact/package boundary and editor protocol.
- [x] Recommend one narrow prototype and the question it must answer.
- [x] Extract implementation into separate, ordered plans after the research decision.

## Verification

- [x] The proposal can represent every current Selection node without a second semantic model.
- [x] The proposal distinguishes canonical AST, recoverable document state, and UI state.
- [x] Both extension and comprehension have credible future authoring paths.
- [x] Mixed and nested expressions are addressed rather than hidden by a simple mode switch.
- [x] Framework recommendations are supported by repository and primary technical evidence.
- [x] Explorer integration is an adapter, not the ownership boundary of the editor.
- [x] The resulting artifact can be documented independently for Ontahí developers.

## Decisions

1. Selection AST remains the persisted and transported membership meaning; the text document owns
   recoverable authorial state while editing.
2. The editor is not assumed to be implemented in React.
3. The current Explorer picker remains a useful simple projection, not the final language editor.
4. Implementation waits for a research-backed editor and language-service boundary.
5. The first implementation target is the Entity Data filtering experience, not a complete Ontahí
   textual language.
6. Use Lezer with CodeMirror 6 for the first proof and keep that choice behind an editor adapter.
7. Syntax diagnostics, semantic diagnostics, and execution failures are separate result channels.
8. Static Entity reflection resolves the first language; Runtime Data Reflection may later supply
   capability and dynamic-value evidence.
9. Contextual expressions come first. Entity-qualified `Todo where ...` syntax waits for a surface
   that lacks an Entity context.
10. The first Graph Read proof may use a fixed bounded result instead of pulling pagination,
    ordering, or free-text search into Selection membership.

## Deferred Decisions

1. Whether Entity-qualified documents use `Todo where ...`; no current host needs that form.
2. Date/datetime and Ref literal syntax and portable encoding.
3. Relation predicates until Plan 119 extends the canonical algebra.
4. Query shaping (`select`, `include`, `order by`, pagination, and limits) until the Selection POC
   proves the language service.
5. Saved document/version lifecycle and whether a printer is needed; the POC does not promise
   format-preserving AST-to-text round trips.
6. Runtime-backed value search, authority, cost, and pagination until Runtime Data Reflection has a
   suitable profile.
7. LSP transport, collaborative editing, CLI syntax, operation commands, and natural-language
   intent resolution.
8. Whether a later stable package keeps the provisional package names.

## Closure / Evolution

Completed on 2026-09-07. Main-repository evidence and primary framework documentation support the
Lezer + CodeMirror decision, Atlas now records the semantic layering and ownership boundary, and
Plans 118a through 118d define independently verifiable vertical slices. Implementation did not
start as part of this research plan. Plan 118a subsequently completed the walking skeleton, and
Plan 118b is now the next independently actionable language slice.
