---
'@ontahi/core': patch
---

Allow contextual factories to target variants declared before their base entity is enriched with
relations or contextual selections. Preserve narrowed destination types while still requiring the
exact same base object at runtime, so root and nested classified navigation compose without casts.
