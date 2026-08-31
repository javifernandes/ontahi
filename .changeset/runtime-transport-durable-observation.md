---
'@ontahi/core': minor
'@ontahi/react': minor
'@ontahi/runtime-express': minor
---

Add a transport-neutral Runtime Transport with asynchronous Durable Operation observation. The
Fetch implementation sends versioned `durable.operation.inspect` requests and owns polling and
abort behavior, React hooks consume snapshots without selecting a delivery strategy, and Express
can project an explicitly configured Runtime Protocol dispatcher at one host-owned path.
