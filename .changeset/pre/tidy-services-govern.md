---
'@ontahi/core': minor
'@ontahi/devtools': minor
---

Add governed non-model service attempts with per-resource admission limits, semantic attribution,
safe Resource evidence, and opaque host-owned HTTP configuration. Model and service evidence share
one discriminated attempt ledger while preserving model-specific metering.
The released model-command v1 response keeps its existing model-only evidence shape while operation
responses expose the generalized resource ledger.

Display governed service attempts and summaries in Devtools without exposing service credentials or
request payloads.
