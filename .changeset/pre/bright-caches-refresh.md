---
'@ontahi/react': minor
---

Invalidate React Query Graph Reads from committed semantic mutations returned by the Runtime
Protocol. Graph Reads now retain canonical dependency metadata independently from query keys, while
Graph Command, Operation, and terminal durable Operation hooks prefer conservative semantic
matching and preserve existing declared invalidation as a compatibility fallback.
