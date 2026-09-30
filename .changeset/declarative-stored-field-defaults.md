---
'@ontahi/core': minor
---

Declare stored scalar Field defaults with `field.default`, receiver-generated creation values with
`field.generated`, and persisted reference requirements with `field.existingRef`. Reflect these
contracts through graph schemas, materialize receiver-owned values in Entity creation commands, and
enforce required references across application mutation paths. Model graph-command validation now
also distinguishes direct proposals from explicit choice options. Entity create, update, and delete
outcomes can now drive declared post-commit Reactions, allowing structural mutations to retain
external effects without boilerplate Domain Operations. Intrinsic Entity Reactions may be
colocated in `entity({ reactions })`, while application-level declarations remain available for
cross-Entity behavior.

Relations can now declare structural delete lifecycle with `onDelete: 'cascade'` on `hasMany` and
`onDelete: 'detach'` on `manyToMany`. The application receiver applies those effects atomically
when the storage supports transactions and routes their outcomes through the same post-commit
Reaction machinery. Entity Mutation Command policies may also authorize individual actions after
canonical request resolution.
