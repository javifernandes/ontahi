---
'@ontahi/core': minor
---

Add a transport-neutral remote data graph runtime that executes `get`, `run`, and `count` through
the versioned read protocol while keeping authority and credentials outside the graph request.
Preserve structured protocol, response, transport, and unsupported-capability failures so remote
Commands and streams remain explicitly unavailable until their protocols are implemented.
