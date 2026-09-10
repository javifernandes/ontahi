---
'@ontahi/language': minor
'@ontahi/language-codemirror': patch
---

Compose named Selection factories by intersection in Console reads: repeated `.by(...)` in the
TS-like dialect and `by ... and by ...` in declarative. Preserve every invocation during dialect
conversion and table modifier edits, complete subsequent factories and their inputs, and reject an
invalid or incomplete invocation without executing a valid prefix. Execution remains an ordinary
expanded Selection; the Core SDK continues to compose factory results with `.and(...)`.
