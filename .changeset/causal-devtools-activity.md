---
'@ontahi/devtools': minor
'@ontahi/core': minor
'@ontahi/react': minor
---

Carry client-local Graph Read refresh causality from semantic React invalidation into Runtime Transport diagnostics. Group causally refreshed reads and terminal durable-operation metadata into one semantic Activity entry, present concrete refresh effects inside the causing mutation, and retain correlated protocol traffic in its nested runtime trace instead of duplicating it as top-level activity.
