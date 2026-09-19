---
'@ontahi/react': patch
---

Reconcile successful useGraphQuery reads and refetches into the provider's normalized client cache, including nested selected entities and query outputs. Cache inspection now includes initial page data and refreshed values after mutations, with correct singular and scalar result shapes.
