---
'@ontahi/core': minor
---

Replace model-specific update and projected invocation payloads with a resolved interpretation envelope containing existing GraphCommandRequest or OperationInvokeRequest contracts. Parse with the existing protocol parsers, derive invocation inputs from operation declarations, revalidate scope before dispatch, and forward canonical requests without domain argument translation. Rename interpretModelOperation to interpretModelRequest and replace update bindings with scoped graph command exposures.
