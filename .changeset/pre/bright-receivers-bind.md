---
'@ontahi/core': minor
---

Let Domain Operations declare Entity-type or required Entity Ref input receivers, normalize them to
portable reflected metadata, validate canonical receiver targets during application composition,
and bind Entity Ref calls through the declared participant. Preserve legacy `graphOps.receiver` and
unique-schema binding behavior with explicit precedence while rejecting canonical receiver
redirection and unregistered targets.
