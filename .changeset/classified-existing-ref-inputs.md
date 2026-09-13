---
'@ontahi/core': patch
---

Support experimental `graphSchema.existingRef(Variant)` Operation inputs using canonical base
Refs. The receiver checks the resolved record's classification, identity and base schema before
entering the Operation body, including custom resolvers. Reflect the variant contract separately
from base identity in schema descriptors and JSON Schema. Stored variant Reference Fields remain
unsupported.
