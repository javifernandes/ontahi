---
'@ontahi/core': minor
'@ontahi/devtools': patch
'@ontahi/supabase': patch
---

Expose payload-free Event resume evidence on durable Task snapshots. Native Task observations now
retain the Event wait, occurrence, delivery claim, and ingress provenance needed to explain a
restart-safe continuation without exposing the Event payload.

Devtools renders the Event wait, ingress-driven resume, and Task completion as one causal Operation
activity with expandable JSON details.
