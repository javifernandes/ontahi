---
'@ontahi/core': minor
---

Declare stored scalar Field defaults with `field.default`, receiver-generated creation values with
`field.generated`, and persisted reference requirements with `field.existingRef`. Reflect these
contracts through graph schemas, materialize receiver-owned values in Entity creation commands, and
enforce required references across application mutation paths. Model graph-command validation now
also distinguishes direct proposals from explicit choice options. Entity create, update, and delete
outcomes can now drive declared post-commit Reactions, allowing structural mutations to retain
external effects without boilerplate Domain Operations.
