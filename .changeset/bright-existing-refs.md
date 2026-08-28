---
'@ontahi/codegen': minor
'@ontahi/core': minor
'@ontahi/explorer-react': minor
---

Add `graphSchema.existingRef(Entity)` for immediate Domain Operation inputs. Callers keep sending
portable Refs, while the authorized UnitOfWork materializes typed participants before the body,
preserves their original `.ref` identity, reports conventional missing-Entity failures, and
reflects the requirement through JSON Schema, generated clients, and Explorer.

Domain Operation bodies may also use `Effect.fn(function* (...) { ... })` or direct `*run(...)`
Effect generators. The direct form keeps contextual input typing and follows the ordinary Effect
execution path for contracts, UnitOfWork, atomicity, failures, and defects.
