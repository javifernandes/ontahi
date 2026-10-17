---
'@ontahi/core': minor
'@ontahi/devtools': patch
---

Add a policy-aware HTTP ingress boundary for declared Events. Authenticated provider outcomes are
matched against explicit Event routes, normalized payloads are validated against the registered
declaration and version, and accepted occurrences retain provider, external event, delivery, and
receipt provenance without copying authentication secrets.

Event ingress now drives correlated durable Task waits through the same Event Runtime contract.
Runtimes that advertise no deduplication continue to create distinct occurrences for repeated
provider deliveries while preserving the stable external delivery identity as provenance.

Devtools Event details summarize external ingress provenance alongside Operation and mutation
causation.
