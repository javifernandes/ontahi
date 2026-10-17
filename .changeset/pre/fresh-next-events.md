---
'@ontahi/runtime-nextjs': minor
---

Add an App Router Event ingress adapter that preserves the raw Web Request for provider
authentication and normalization before ingesting an explicitly routed, registered Event.

Rejected, ignored, unauthorized, invalid, and stale deliveries remain outside the Event Runtime,
while unexpected provider failures can be reported without exposing their cause in the response.
