---
'@ontahi/core': minor
'@ontahi/explorer-react': minor
---

Remove the legacy `graphOps.receiver` declaration and its normalized descriptor provenance. Migrate
input receivers to the canonical Operation declaration, for example
`receiver: { kind: 'input', path: 'list' }`. Explorer instance actions now consume only canonical
receiver metadata, so Selection inputs no longer produce instance actions unless a future canonical
receiver kind models them. Bound calls supply the receiver through the bound Ref and must omit its
field from the invocation input. `graphOps.inputRefs` remains available for locator traversal
metadata.
