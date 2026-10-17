---
'@ontahi/core': minor
'@ontahi/codegen': minor
'@ontahi/react': minor
'@ontahi/devtools': minor
---

Add a reusable Runtime Model Command client and let `OntahiGraphProvider` automatically invalidate
overlapping Graph Reads for committed semantic effects from any execution on its Runtime Transport,
including Model Commands and Devtools Console actions.

Let Runtime transports describe their implementation kind and let Devtools compose and discover
diagnostics directly from one routed Runtime Transport.

Generate a portable client application catalog, retain it on Runtime Graph clients, and expose the
resolved client session through `OntahiGraphProvider` so Devtools can discover Entities, identity,
cache, and transport without duplicate host wiring.
