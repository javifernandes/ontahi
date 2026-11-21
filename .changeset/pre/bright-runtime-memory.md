---
'@ontahi/core': patch
---

Move the in-memory Data Graph storage and execution adapter behind the runtime storage boundary
while preserving all established package-root and `data-graph` exports.

Implements `ontahi://plans/171-core-model-and-runtime-boundaries`.
