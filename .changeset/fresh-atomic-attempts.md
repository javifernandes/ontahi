---
'@ontahi/core': minor
---

Allow atomic Domain Operations to combine their transaction boundary with execution retry policy,
rolling back each failed attempt before opening the next boundary.
