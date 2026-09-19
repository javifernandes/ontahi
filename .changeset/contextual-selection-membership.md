---
'@ontahi/core': minor
'@ontahi/sql': patch
'@ontahi/codegen': minor
---

Add experimental deferred relation-image membership, Selection.through and parameterless contextual
Selection factories. Selection schemas validate source paths against explicit receiver-owned model
definitions, and in-memory reads evaluate composed navigation before final read shaping. Commands
and graph read protocol v1 explicitly reject this membership. PostgreSQL/MySQL and Supabase support
contextual reads within their documented provider limits. Entities can declare contextual selections with
`selections: ({ self }) => ({ parts: self.contentNodes.where(node => node.type.eq('part')) })`.
Selection properties preserve deferred membership and target types through composition and runtime
binding. Discovery exposes copied contracts; codegen compiles supported declarations to portable
data for generated clients. Both Console dialects author navigation, while remote execution uses
capability-negotiated Graph Read v2 with per-hop grants. Contextual observation remains deferred.
