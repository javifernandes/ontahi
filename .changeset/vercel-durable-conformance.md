---
'@ontahi/runtime-vercel-workflows': patch
---

Enforce durable admission when Vercel Workflow uses an atomic Task store. Preserve Ontahí waiting snapshots and prevent duplicate submission after an ambiguous Workflow start.

Persist explicit execution failures, including ambiguous external-effect checkpoints, so equivalent invocations can report that reconciliation is required.

Use ordered Task Storage observation for Vercel workflows and fence late checkpoint writes during active-run cancellation. Apply the updated PostgreSQL Task schema to journal Vercel snapshots.
