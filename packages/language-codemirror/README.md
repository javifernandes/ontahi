# `@ontahi/language-codemirror`

CodeMirror 6 projection for the editor-neutral services in `@ontahi/language`.

```ts
import { selectionExpressionExtensions } from '@ontahi/language-codemirror';

const extensions = selectionExpressionExtensions({
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
});
```

The adapter owns CodeMirror language support, completion UI, syntax and semantic highlighting,
hover UI, and lint projection. Parsing, cursor context, reflection lookup, diagnostic meaning, and
lowering remain in `@ontahi/language`; Explorer and other hosts own editor lifecycle and execution.

Typing activates contextual suggestions; `Ctrl-Space` opens them explicitly. Field identifiers,
unsupported or unresolved names, operators, keywords, and values receive stable semantic classes.
Hovering a Field shows its reflected type/nullability and hovering an operator explains its
canonical Selection meaning. Reconfiguring the extension with another Entity discards the previous
reflection immediately.
