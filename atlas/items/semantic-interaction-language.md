---
id: ontahi.semantic-interaction-language
kind: capability
title: Ontahí Semantic Interaction Language
parent: ontahi
status: shaping
horizon: next
supports:
  - ontahi.model.selection
  - ontahi.model.query
  - ontahi.developer-experience
  - ontahi.source-code-organization.explorer-react
relatedPlans:
  - ontahi://plans/116-ontahi-selection-model
  - ontahi://plans/118-ontahi-selection-language-editor
  - ontahi://plans/118a-explorer-selection-language-walking-skeleton
  - ontahi://plans/118b-selection-expression-algebra
  - ontahi://plans/118c-reflection-powered-selection-language-service
  - ontahi://plans/118d-projectional-selection-editor-experiment
  - ontahi://plans/118e-runtime-backed-reference-value-projections
  - ontahi://plans/119-selection-relation-predicates
  - ontahi://plans/126-ontahi-runtime-data-reflection
  - ontahi://plans/147-application-bound-headless-graph-reads
---

The [[ontahi.semantic-interaction-language|Ontahí Semantic Interaction Language]] is a family of
human-facing textual and structural projections over Ontahí's existing semantic model. Its first
concrete language is a contextual Selection expression used to filter Explorer Entity Data:

```text
completed = false
```

The durable capability is larger than one Explorer input, but it is not a new universal Ontahí AST.
An Entity supplied by the host gives the expression its root; semantic analysis lowers a valid
document to the existing [[ontahi.model.selection|Selection]] representation; the ordinary Graph
Read runtime executes that Selection. CLI, Devtools, web, and future conversational surfaces may
project the same meaning differently without adopting Explorer or an editor engine.

## Semantic Layers

```text
text document
    ↓ incremental parse
recoverable syntax tree + source positions
    ↓ semantic resolution against reflection
resolved meaning + diagnostics
    ↓ lowering when valid
canonical Selection AST
    ↓ existing Query / Graph Read execution
runtime result or runtime failure
```

The layers have different truth and lifetime:

1. The text document owns spelling, whitespace, grouping, cursor positions, and incomplete input.
2. The parser syntax tree owns grammatical structure, recovery nodes, and source ranges. It may be
   rebuilt or incrementally updated and is not portable Selection meaning.
3. Semantic resolution binds identifiers and literals to reflected Entity and Field facts. It may
   report an unknown Field, a value/type mismatch, or an unsupported operator without changing the
   syntax tree.
4. The canonical Selection AST remains the portable membership meaning used by Queries, Commands,
   policy, transport, and providers. The language lowers to this AST; it does not define a second
   semantic Selection algebra.
5. Execution owns authority rejection, unavailable capabilities, adapter failure, and data-dependent
   outcomes. Those failures are not syntax or semantic diagnostics.

For example, a missing value after `completed =` is a syntax diagnostic. Applying a comparison
operator to a Boolean Field is a semantic diagnostic. A server rejecting an otherwise meaningful
predicate under the current Graph Read policy is an execution result.

## Ownership Boundary

The intended implementation has two independent ownership boundaries:

1. An editor-neutral Ontahí language package owns grammar generation, parsing, syntax traversal,
   reflection-shaped semantic analysis, diagnostics, completion data, and lowering to Core's
   existing Selection types. It may use Lezer internally without exposing Lezer nodes as the
   semantic API.
2. A CodeMirror adapter owns editor extensions, syntax and semantic highlighting, completion UI,
   lint markers, hover, and later decorations or widgets. It depends on the headless language
   service. It does not own lowering or Ontahí semantics.

The first implementation should use separate `@ontahi/language` and
`@ontahi/language-codemirror` packages so non-visual CLI or server consumers do not install an
editor runtime. These names are an implementation decision that can still be corrected before a
stable release; the durable boundary is headless language service versus editor adapter.

`@ontahi/explorer-react` embeds the adapter and supplies the selected Entity context. It owns the
Data-table experience, not the language. [[ontahi.source-code-organization.devtools|Ontahí
Devtools]] may later use the same service to explain or author semantic payloads, but runtime
inspection does not become language ownership.

## Reflection And Assistance

Initial semantic resolution needs static reflected facts already projected by Explorer: Entity
name, Field name, scalar type, nullability, enum values, value type, and reference target where
present. The language service consumes a narrow framework-owned reflection input rather than
importing Explorer contracts or a storage adapter.

Static reflection answers whether a Field exists, how a literal should be interpreted, and which
operators are meaningful for its type. [[ontahi.runtime-data-reflection|Runtime Data Reflection]]
may later contribute authority-aware capabilities or dynamic value suggestions, such as searchable
Refs. It is not required to parse or lower the first Boolean predicate. Runtime capability and
authority may narrow what can execute without changing the intrinsic meaning of a valid Selection;
an editor affordance is never an authorization decision.

That static boundary now also produces cursor context, structural completions, semantic
classifications, and hover help from the same recovered syntax and resolver facts. Boolean and enum
values are finite reflection facts; string and number suggestions are syntax placeholders, not
observed data. The CodeMirror adapter projects those results and replaces its Entity reflection as
one compartment, so assistance from a previously selected Entity cannot survive a context switch.

## First Proof And Evolution

The first proof was intentionally only a contextual Boolean equality in Explorer's Entity Data
surface. It demonstrated the complete path from text through the existing Selection AST and the
existing `graph.read` Runtime Protocol family without translating the expression into Explorer's
`ReflectedEntityDataFilter` side contract.

The established textual projection now covers `all`, `none`, Boolean `and` / `or` / `not`,
parentheses, equality, membership lists, null checks, and scalar ordering comparisons. Parentheses
remain in recoverable document syntax while lowering delegates normalization to Core's existing
Selection constructors. The initial compatibility matrix admits matching Boolean, number, string,
id, and enum literals; ordering remains number-only; and date, datetime, JSON, Reference, and
relation meanings fail explicitly until their portable semantics are designed.

The first hybrid projection is an opt-in CodeMirror adapter policy for finite Boolean and enum
literals. It derives replacement controls only from a complete, semantically resolved document;
each control change dispatches a normal source-text transaction, and no projection type enters the
headless language service or Selection AST. Atomic cursor ranges, ordinary history and clipboard
behavior, explicit source reveal, recoverable deletion, and Entity-reflection replacement preserve
the text document as the only editable truth.

The initial experiment supports continuing with CodeMirror for finite values: the projected control
reduces literal editing to a reflected choice while Escape exposes the exact source range whenever
direct text editing is needed. Dates and structural groups remain separate design risks rather than
implied extensions of this result; runtime-backed Reference identity is isolated in the next slice.

Reference identity is the first runtime-backed value projection. A quoted identity on a Reference
Field with one reflected target identity lowers to the existing canonical Entity Ref; the headless
language service exposes only static target context. An optional CodeMirror provider searches and
resolves authorized target rows, writes only identity text, and treats richer labels as disposable
presentation. Missing or denied lookup never invalidates otherwise meaningful source. Explorer
adapts its existing reflected Entity data reader for this path, so selection editing does not gain a
provider shortcut or a second authority model.

Only after the Selection proof is sound should a new plan investigate complete Query text such as
`order by` or `limit`. Relation quantifiers wait for the canonical Selection work in Plan 119.
Commands, saved document lifecycle, LSP transport, collaborative editing, natural-language intent,
and general visual query builders are intentionally deferred.
