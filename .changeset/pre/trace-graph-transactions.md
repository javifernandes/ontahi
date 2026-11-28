---
'@ontahi/core': patch
'@ontahi/opentelemetry': patch
'@ontahi/postgres': patch
---

Trace runtime reads, commands, transactions, and Units of Work with the configured telemetry
adapter. Report commits before post-commit work runs.

Trace model resource attempts with distinct admission rejection and attempt failure outcomes.

Link durable Task execution spans to the enqueue span and assign persisted execution ordinals
with built-in Task storage. Apply the updated PostgreSQL Task schema SQL before upgrading.
