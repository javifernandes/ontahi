---
'@ontahi/core': minor
---

Declare replicated sources and derived output on server Entities. Prepare a publication diff from the
declaration and apply it through Entity Mutation Commands inside the active Data Graph transaction so
existing mutation Reactions run after commit. Declared dependencies order publications within a group.
Declared dependencies also select the observed revisions that invalidate a derived checkpoint.
