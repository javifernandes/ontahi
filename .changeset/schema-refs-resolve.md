---
'@ontahi/core': minor
'@ontahi/explorer-react': minor
'@ontahi/react': minor
---

Make top-level Domain Operation Ref inputs schema-native: declare `field.ref(Entity)` once, use the
Ref directly with `resolve()`, `invalidate()`, and `refresh()` in server implementations, preserve
portable Refs across the client bridge, and derive Explorer Ref controls from reflected schema.

Remove the transitional authored `inputRefs` Domain Operation contract and legacy scalar lowering.
