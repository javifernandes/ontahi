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
rather than an opaque availability failure. Boolean and enum literals use the same schema-aware,
source-backed value controls as the Explorer Selection editor. Omitting `.where(...)` defaults to
the canonical `all` Selection, so unfiltered reads can use `Entity.many()`, `Entity.first()`, or
`Entity.one()` directly. `Entity.count()` and `Entity.where(Selection).count()` use the existing
Graph Read count mode and render its scalar result without applying a row limit or cardinality.
Many reads accept a source-backed `.limit(nonNegativeInteger)` modifier before their terminal;
invalid limits and meaningless combinations with `first()`, `one()`, or `count()` are rejected
before execution.
