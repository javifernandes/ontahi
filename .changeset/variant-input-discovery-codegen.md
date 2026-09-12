---
'@ontahi/core': patch
'@ontahi/codegen': patch
---

Expose graph-native Operation input descriptors in graph discovery. Project static classified
existingRef inputs to browser-safe schemas while preserving base Ref identity and the classification
requirement, including imported variants and optional/nullable fields. Do not emit server resolvers.
Diagnose missing generated base schemas and unsupported declaration shapes. Preserve shorthand
Operation input declarations instead of silently omitting them from generated clients.
