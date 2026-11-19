---
'@ontahi/core': minor
---

Add a behavior-first Materializer SPI and in-memory runner for replicated versioned models. Hosts
can calculate affected outputs from retained dependency evidence, derive full or incremental
candidates, and request a safe rebuild when dependencies are unknown.

Implements `ontahi://plans/169-replicated-versioned-models-kernel-and-materializer-spi` and shapes
`ontahi.model.replicated-versioned-model`.
