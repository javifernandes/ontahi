---
'@ontahi/core': minor
'@ontahi/devtools': minor
'@ontahi/language': minor
'@ontahi/language-codemirror': minor
'@ontahi/runtime-express': minor
'@ontahi/runtime-nextjs': minor
---

Add the first keyword-free Devtools Console walking skeleton. It reuses the Selection grammar,
reflection, diagnostics, and CodeMirror assistance inside `Entity.where(...).many()`,
`Entity.where(...).first()`, and `Entity.where(...).one()`, lowers valid documents to canonical
Graph Read requests, and executes them through the configured Runtime Transport. Console results
can be inspected through the same visual projection used by Activity or as JSON. Exact-one
cardinality mismatches cross the Graph Read protocol as an authority-safe structured rejection
rather than an opaque availability failure.
