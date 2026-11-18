---
'@ontahi/core': minor
---

Add a provider-neutral in-memory acceptance kernel for replicated versioned models. Hosts can now
record exact source and output frontiers, apply full or incremental results, detect replay, gaps,
Materializer version changes and frontier conflicts, and preserve the last accepted JSON state
after rejection or failure.

Implements `ontahi://plans/169-replicated-versioned-models-kernel-and-materializer-spi` and shapes
`ontahi.model.replicated-versioned-model`.
