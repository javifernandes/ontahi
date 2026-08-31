---
'@ontahi/core': minor
---

Add `application.graph.read(...)` as the typed headless host boundary for plain Queries, Views,
`first`, `one`, `count`, and `exists`. Reads automatically enter the server execution context and
pin the storage runtime configured by that exact application while preserving View parameters and
provider read options.
