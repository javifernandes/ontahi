---
'@ontahi/codegen': minor
'@ontahi/core': minor
'@ontahi/explorer-react': minor
'@ontahi/runtime-nextjs': minor
---

Add named portable Domain Operation input conditions backed by canonical Model Expression IR.
Codegen compiles natural Ref-identity expressions without executing callbacks, emits one condition
registry shared by server and generated clients, and reports unsupported syntax at its source.
Core evaluates conditions authoritatively before the body and exposes tri-state advisory
evaluation, dependencies, conventional rejection, reflection, and an explicit runtime-only
builder. Explorer presents reflected condition names.

Callback-valued top-level `contracts.pre` and `contracts.post` are removed during the alpha. Move
arbitrary server-only checks to `contract({ pre, post })` in `concerns`; top-level
`contracts.pre` now accepts named portable conditions.
