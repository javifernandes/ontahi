---
'@ontahi/core': minor
---

Refresh active Runtime Protocol Graph Read observations after possibly overlapping committed
Commands and Operations. Reevaluation reapplies the subscriber's authority, coalesces slow-consumer
work, preserves native storage observation, and deduplicates equal snapshots.
