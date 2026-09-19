---
'@ontahi/codegen': patch
---

Project declarative recursive `graphSchema.lazy` Value factories into generated clients. Generated schemas retain recursive validation and inferred types without copying server types or executing host closures. Only zero-argument expression factories returning a Value with the same literal name are supported; opaque factories still fail generation.
