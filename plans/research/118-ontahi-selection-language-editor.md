# 118. Ontahí Selection Language Editor Research

Status: research

Canonical ID: `ontahi://plans/118-ontahi-selection-language-editor`

Migrated from: `bookops://plans/118-ontahi-selection-language-editor`
Original path: `plans/research/118-ontahi-selection-language-editor.md`
Source commit: `a27ef5d1`

Related plans:

1. [116 Ontahí Selection Model](../done/116-ontahi-selection-model.md)
2. [117 Alive UI From Reflected Selections](../backlog/117-alive-ui-from-reflected-selections.md)
3. [76 Operation Input Metadata And UI](bookops://plans/76-operation-input-metadata-and-ui)

## Summary

Shape a reusable Selection language editor whose source of truth is Ontahí's canonical Selection
AST. Research editor frameworks, language tooling, interaction models, and integration boundaries
before choosing an implementation.

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

The Selection AST is a semantic family-body value that graph reads and commands can carry through
the [[ontahi.runtime-protocol|Ontahí Runtime Protocol]]. It is not the Runtime Protocol envelope's
AST, and the protocol should not own its grammar. The editor changes how a Selection is authored;
transport continues to carry the same canonical Selection meaning.

## Research / Evidence

The research should compare at least these implementation families:

1. text-editor foundations with custom language support, such as CodeMirror or Monaco;
2. parser and incremental syntax infrastructure, such as Lezer, Tree-sitter, or equivalent tooling;
3. language-service approaches with completion, diagnostics, hover information, formatting, and
   AST synchronization;
4. structural or projectional editor foundations;
5. hybrid editors that render structured tokens while retaining text-like keyboard interaction.

Explorer already embeds Monaco for raw JSON inspection, but reuse is a candidate rather than a
decision. Bundle size, portability, mobile behavior, accessibility, extension APIs, and ownership
of the document model must be compared explicitly.

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
Selection AST
    ↕ parse / print / reconcile
Selection language service
    ├── typed completion
    ├── suggestions from reflection
    ├── diagnostics
    ├── formatting
    └── semantic selection changes
    ↕ editor protocol
Editor engine
    ├── text
    ├── projectional / structural
    └── hybrid
    ↕ host adapter
Explorer, operation forms, Data filters, and future applications
```

The AST remains canonical. Text, structured controls, chips, and visual groups are projections over
it. An editor may keep an intermediate document model for cursor and recovery state, but persisted
and transported meaning must remain Selection.

The first implementation proof should be one end-to-end vertical slice in Explorer's Entity Data
table: replace ad hoc field-filter controls with an assisted textual or hybrid expression for the
current Entity, lower it to the canonical Selection AST, execute it through the existing graph-read
path, and preserve a structured or raw-AST inspection escape hatch. That slice should prove the
language-service boundary; it should not make Explorer the owner of the language.

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

## AST Stability Gate

Before implementation, confirm or explicitly version:

1. node vocabulary and discriminators;
2. typed field operators and value encoding;
3. `references` and locator representation;
4. recursive `and`, `or`, and `not` semantics;
5. relation predicates;
6. named selections and parameters;
7. normalization rules that preserve authorial intent;
8. serialization and forward-compatibility policy;
9. partial or invalid document recovery outside the canonical AST.

The editor may prototype against an incomplete AST, but it must make unstable assumptions visible
rather than encoding them as permanent UI structure.

## Execution Slices

### Slice 1: Language And Artifact Inventory

- [ ] Inventory current Selection nodes, builders, reflection, validation, and provider lowering.
- [ ] Separate canonical AST state from ephemeral editor/document state.
- [ ] Identify unstable AST decisions that block honest editor research.

### Slice 2: UX Sketches

- [ ] Sketch reference selection, one typed predicate, multiple conditions, nested groups, negation,
      and mixed refs/predicates.
- [ ] Sketch keyboard, autocomplete, error recovery, and accessible navigation behavior.
- [ ] Compare simple, textual, structural, and hybrid projections.

### Slice 3: Framework Research

- [ ] Define a comparison rubric before evaluating libraries.
- [ ] Compare editor engines and parsing/language-service options against the rubric.
- [ ] Record bundle, portability, accessibility, extensibility, licensing, and maintenance evidence.
- [ ] Determine whether Monaco reuse is an advantage or accidental coupling.

### Slice 4: Recommendation

- [ ] Recommend an artifact/package boundary and editor protocol.
- [ ] Recommend one narrow prototype and the question it must answer.
- [ ] Extract implementation into a separate actionable plan only after the research decision.

## Verification

- [ ] The proposal can represent every current Selection node without a second semantic model.
- [ ] The proposal distinguishes canonical AST, recoverable document state, and UI state.
- [ ] Both extension and comprehension have credible authoring paths.
- [ ] Mixed and nested expressions are addressed rather than hidden by a simple mode switch.
- [ ] Framework recommendations are supported by runnable prototypes or direct technical evidence.
- [ ] Explorer integration is an adapter, not the ownership boundary of the editor.
- [ ] The resulting artifact can be documented independently for Ontahí developers.

## Decisions

1. Selection AST remains the persisted and transported source of truth.
2. The editor is not assumed to be implemented in React.
3. The current Explorer picker remains a useful simple projection, not the final language editor.
4. Implementation waits for a research-backed editor and language-service boundary.
5. The first implementation target is the Entity Data filtering experience, not a complete Ontahí
   textual language.

## Open Questions

1. Should the primary authoring model be text, structure, or a hybrid?
2. Does the language need a stable textual grammar, or can an editor protocol operate directly over
   AST edits?
3. How should incomplete text map to recoverable document state without polluting Selection AST?
4. How much entity data should autocomplete load, and how do authority and pagination apply?
5. Can visual and textual projections round-trip without destroying formatting or authorial
   grouping?
6. Which capabilities belong in a framework-neutral language service versus an editor-specific
   extension?

## Closure / Evolution

This research is complete when it produces an evidence-backed artifact shape, framework
recommendation, and narrowly scoped prototype plan. It should reshape the durable Selection and
editor Atlas artifacts before any implementation plan begins.
