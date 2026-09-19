---
'@ontahi/codegen': patch
---

Close named Value schema dependencies in generated clients, including imported aliases, nested
Values, shared fields, and receiver-bound Entity schemas. Preserve shared Value identity and
report unresolved, cyclic, conflicting, or opaque schema dependencies instead of emitting broken
browser modules or copying host code.
