---
'@ontahi/core': minor
---

Resolve model output into an envelope containing existing GraphCommandRequest or OperationInvokeRequest contracts. Parse with the existing protocol parsers, derive invocation inputs from operation declarations, revalidate scope before dispatch, and forward canonical requests without domain argument translation. Expose scoped graph commands through canonical request schemas and validators.
