---
'@ontahi/core': patch
'@ontahi/codegen': patch
---

Reject unsupported nested classified Operation participants during code generation, matching the
runtime's direct object/Value field contract (including optional/nullable wrappers).

Require a declared canonical base identity for existingRef variant targets. Validate the complete
identity locator before resolution, including composite identities; alternate or incomplete
locators report invalid input instead of a misleading entity-not-found failure.
