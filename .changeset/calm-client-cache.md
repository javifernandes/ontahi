---
'@ontahi/core': patch
---

Move the Graph client cache behind the runtime client boundary and split its records, events,
freshness, normalization, Entity storage, output storage, and reconciliation responsibilities while
preserving the established cache API.

Implements `ontahi://plans/171-core-model-and-runtime-boundaries`.
