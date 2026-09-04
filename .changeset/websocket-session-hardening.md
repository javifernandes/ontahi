---
'@ontahi/core': patch
'@ontahi/react': patch
'@ontahi/runtime-express': patch
---

Harden WebSocket Runtime sessions by bounding completed request identity retention, releasing
observation and socket resources deterministically, reporting handshake send failures, and making
Express upgrade-boundary ownership explicit.
