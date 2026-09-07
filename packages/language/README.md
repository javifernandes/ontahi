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
```

Parentheses, then `not`, `and`, and `or` define precedence. Equality and membership support
Boolean, number, string, id, and enum Fields with matching literals; ordering comparisons are
currently restricted to number Fields. Date, datetime, JSON, Reference, and relation semantics
remain explicit future work.

Valid meaning lowers to the canonical `SelectionAst` from `@ontahi/core`. Incomplete source and
source ranges remain language-document state. Hosts own execution and keep runtime failures
separate from syntax and semantic diagnostics.

`@ontahi/language/lezer` exposes the generated parser for editor adapters. Lezer syntax nodes are
not the package's semantic Selection model.
