---
'@ontahi/core': patch
---

Move the generic Zod value-validation helpers to the new `@ontahi/core/value/zod` subpath. The
historical `@ontahi/core/model/zod` subpath remains as a deprecated compatibility facade, and
package-root exports keep the same identities.
