---
'@ontahi/codegen': patch
---

Close browser output-schema dependencies through wrappers such as nullable, array, union and named,
including imported aliases and shared Values. Generated outputs preserve their inferred types and
schema identity. Requesting an anonymous output that cannot be safely projected now reports its
Operation and the unsupported dependency instead of emitting an invalid browser module.
