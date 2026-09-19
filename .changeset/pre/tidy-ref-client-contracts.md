---
'@ontahi/codegen': patch
---

Include schema-native `ref` and `existingRef` Operation inputs when generating selection-mode client contracts. These reference-input Operations retain both input and output contracts, preserving participant inputs and typed query results instead of dropping them from the browser facade. Existing Selection-only projection behavior is unchanged.
