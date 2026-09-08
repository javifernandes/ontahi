---
'@ontahi/devtools': minor
'@ontahi/language': minor
'@ontahi/language-codemirror': minor
---

Add the first keyword-free Devtools Console walking skeleton. It reuses the Selection grammar,
reflection, diagnostics, and CodeMirror assistance inside `Entity.where(...).many()`, lowers valid
documents to canonical Graph Read requests, and executes them through the configured Runtime
Transport.
