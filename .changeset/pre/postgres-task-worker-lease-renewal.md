---
'@ontahi/postgres': minor
---

Renew PostgreSQL Task worker leases during execution. A recovered run retains its checkpoint and expired or revoked workers cannot renew their old claims. The worker also provides an abortable polling loop with a configurable idle interval.
