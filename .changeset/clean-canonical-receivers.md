---
'@ontahi/core': minor
'@ontahi/explorer-react': minor
---

Remove the legacy `graphOps.receiver` declaration and its normalized descriptor provenance. Explorer
instance actions now consume only canonical Operation receiver metadata, while `graphOps.inputRefs`
remains available for locator traversal metadata.
