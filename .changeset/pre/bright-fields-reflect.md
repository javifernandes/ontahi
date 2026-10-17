---
'@ontahi/core': minor
---

Reflect Field value ownership and nullability as explicit, orthogonal semantics. Descriptors now
distinguish caller-required, caller-optional, defaulted, receiver-generated, and derived values so
generic authoring and future partial-program consumers can interpret an omitted value without
reconstructing Field intent from schema wrappers.
