---
'@ontahi/codegen': patch
---

Generate named Value Operation inputs containing direct existingRef variant participants, including
imported input aliases. Preserve the Value name, shared declaration, canonical base identity and
classification metadata without copying server resolvers into browser code. Portable variant refs
and conditions over classified inputs remain unsupported.

Compile parameterless isNull() predicates in contextual declarations, allowing classified root
navigation to preserve its null-parent constraint in the generated client.
