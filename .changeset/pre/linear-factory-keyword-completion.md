---
'@ontahi/language': patch
---

Avoid quadratic regex backtracking when completing a conjoined factory keyword after a long
invalid prefix. Scan backward from the cursor while preserving keyword replacement bounds.
