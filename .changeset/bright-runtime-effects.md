---
'@ontahi/core': minor
'@ontahi/react': minor
---

Add a reusable Runtime Model Command client and let `OntahiGraphProvider` automatically invalidate
overlapping Graph Reads for committed semantic effects from any execution on its Runtime Transport,
including Model Commands and Devtools Console actions.
