---
'@ontahi/core': patch
'@ontahi/codegen': patch
---

Reorganize portable Entity, Relation, query, expression, mapping, and value-schema internals behind
the existing public API. Preserve recursive View schema inference, reject empty reference
Selections, and keep generated Entity relation casts valid across the extracted type boundaries.

Implements `ontahi://plans/171-core-model-and-runtime-boundaries`.
