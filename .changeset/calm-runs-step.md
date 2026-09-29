---
'@ontahi/core': patch
'@ontahi/runtime-vercel-workflows': patch
---

Add an experimental explicit Task execution machine whose JSON-safe states advance through named
steps, pending Interactions, and typed completion without suspending the Task function.
Vercel Workflow tasks now reject this execution mode explicitly until that adapter supports it.
