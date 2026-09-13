---
'@ontahi/core': minor
---

Add opt-in Graph Read v2 request/response support for contextual Selection membership. Receivers
must enable relationSelections and grant each outgoing selectionRelations hop separately from
View/include permissions. Each source and final target uses its own policy scope, outside caller
boolean expressions. Discovery advertises advisory v2 capability and outgoing grants.

Keep v1 serialization, default low-level receivers and graph observation closed to
relation-image requests. This slice does not enable Commands or add Console syntax.
