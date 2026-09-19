---
'@ontahi/core': patch
---

Preserve discriminated union result types in configured `operation.invoke` and `operation.runRaw` calls when the declared output schema differs structurally from the implementation result. Infer the execution result from the operation runner rather than intersecting it with hook and schema positions, which could incorrectly produce `never`.
