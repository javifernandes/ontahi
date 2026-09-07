# `@ontahi/language`

Editor-neutral parsing and semantic analysis for Ontahí textual languages.

The first supported document is a contextual Selection Boolean equality:

```ts
import { analyzeSelectionDocument } from '@ontahi/language';

const analysis = analyzeSelectionDocument('completed = false', {
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
});
```

Valid meaning lowers to the canonical `SelectionAst` from `@ontahi/core`. Incomplete source and
source ranges remain language-document state. Hosts own execution and keep runtime failures
separate from syntax and semantic diagnostics.

`@ontahi/language/lezer` exposes the generated parser for editor adapters. Lezer syntax nodes are
not the package's semantic Selection model.
