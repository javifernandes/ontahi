---
'@ontahi/core': minor
'@ontahi/sql': patch
'@ontahi/codegen': minor
---

Add experimental deferred relation-image membership, Selection.through and parameterless contextual
Selection factories. Selection schemas validate source paths against explicit receiver-owned model
definitions, and in-memory reads evaluate composed navigation before final read shaping. Commands,
graph read protocol v1 and SQL explicitly reject this membership until their corresponding support
is implemented. Entities can declare parameterless contextual selections with
`selections: ({ self }) => ({ parts: self.contentNodes.where(node => node.type.eq('part')) })`.
Selection properties preserve deferred membership and target types through composition and runtime
binding. Discovery exposes copied contracts; codegen compiles supported declarations to portable
data for generated clients. Language/UI authoring and remote execution remain follow-up work.
