# `@ontahi/language-codemirror`

CodeMirror 6 projection for the editor-neutral services in `@ontahi/language`.

```ts
import { selectionExpressionExtensions } from '@ontahi/language-codemirror';

const extensions = selectionExpressionExtensions({
  name: 'TodoItem',
  fields: [{ name: 'completed', type: 'boolean', nullable: false }],
});
```

The adapter owns CodeMirror language support and lint projection. Parsing, semantic resolution,
diagnostic meaning, and lowering remain in `@ontahi/language`; Explorer and other hosts own editor
lifecycle and execution.
