---
'@ontahi/core': minor
---

Allow model-backed Operations to resolve a `ModelProvider` from each invocation input through a
typed Effect. Static providers remain supported, while dynamic resolution happens after context
assembly and before the existing governed model executor.
