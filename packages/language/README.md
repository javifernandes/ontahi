# `@ontahi/language`

Editor-neutral parsing and semantic analysis for Ontahí textual languages.

The supported document is a contextual Selection expression. The host supplies the Entity, so the
text contains only membership meaning:

```ts
import { analyzeSelectionDocument } from '@ontahi/language';

const analysis = analyzeSelectionDocument('completed = false', {
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
});
```

The language projects Core's established Selection algebra:

```text
all
none
completed = false and priority >= 2
status in ["open", "blocked"]
not archived = true
note is null
list = "list-inbox"
```

Parentheses, then `not`, `and`, and `or` define precedence. Equality and membership support
Boolean, number, string, id, and enum Fields with matching literals; ordering comparisons are
currently restricted to number Fields. A Reference Field with one reflected target identity accepts
a quoted identity for equality and membership and lowers it to a canonical Entity Ref. Date,
datetime, JSON, composite Reference identity, and relation semantics remain explicit future work.

Valid meaning lowers to the canonical `SelectionAst` from `@ontahi/core`. Incomplete source and
source ranges remain language-document state. Hosts own execution and keep runtime failures
separate from syntax and semantic diagnostics.

The same reflection also powers editor-neutral assistance:

```ts
import {
  classifySelectionDocument,
  completeSelectionDocument,
  hoverSelectionDocument,
} from '@ontahi/language';

const completion = completeSelectionDocument('completed = ', 12, entityReflection);
// completion.items: true, false

const classifications = classifySelectionDocument('completed = false', entityReflection);
const hover = hoverSelectionDocument('completed = false', 2, entityReflection);
```

Completions come from the recovered syntax tree and static Entity reflection. They cover valid
Fields, operators, Boolean and enum values, structural scalar placeholders, and grouping/list
continuations. Optional execution-affordance metadata may hide operators that a host already knows
it cannot execute; it never changes whether the Selection is intrinsically valid.

No completion or hover performs a runtime query. The headless service exposes Reference value
context so an editor host may optionally search or resolve identities through an authorized runtime
capability. Dynamic values, statistics, and authority discovery remain outside this package.

`@ontahi/language/lezer` exposes the generated parser for editor adapters. Lezer syntax nodes are
not the package's semantic Selection model.

## Semantic Console Walking Skeleton

The first Console document embeds that exact Selection grammar inside a self-contained,
keyword-free Query expression:

```ts
import { analyzeConsoleDocument, reflectSelectionLanguageEntity } from '@ontahi/language';

const analysis = analyzeConsoleDocument('TodoItem.where(completed = false).many()', {
  entities: [reflectSelectionLanguageEntity(TodoItem)],
});

analysis.request;
// canonical graph.read body, or undefined while syntax/semantics are invalid
```

The shared Lezer grammar exposes independent `SelectionDocument` and `ConsoleDocument` top rules.
The Console layer resolves the Entity and terminal, while the nested expression keeps the existing
Selection syntax, diagnostics, completion, reflection, and lowering. This walking skeleton supports
`.where(...).many()`, nullable `.where(...).first()`, and exact-cardinality `.where(...).one()` Graph
Reads; additional Query members, Commands, and Operations extend the same expression language rather
than adding leading family keywords.
