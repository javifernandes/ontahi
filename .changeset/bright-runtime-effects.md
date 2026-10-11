---
'@ontahi/core': minor
'@ontahi/react': minor
'@ontahi/devtools': minor
---

Add a reusable Runtime Model Command client and let `OntahiGraphProvider` automatically invalidate
overlapping Graph Reads for committed semantic effects from any execution on its Runtime Transport,
including Model Commands and Devtools Console actions.

Let Runtime transports describe their implementation kind and let Devtools compose and discover
diagnostics directly from one routed Runtime Transport.
