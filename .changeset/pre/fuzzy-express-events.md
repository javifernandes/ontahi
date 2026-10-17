---
'@ontahi/runtime-express': minor
---

Mount explicit Event ingress routes in Express applications using the same provider registry and
raw request boundary as Operation ingress. Accepted provider outcomes now enter the application's
registered Event Runtime, while rejected authentication outcomes never publish an occurrence.

Reject ambiguous configurations that assign one HTTP path to both Operation and Event ingress.
