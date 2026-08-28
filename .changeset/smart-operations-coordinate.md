---
'@ontahi/codegen': minor
'@ontahi/core': minor
'@ontahi/explorer-react': minor
'@ontahi/react': minor
---

Add reflected atomic Domain Operations with `operation.atomic(...)`. Core derives the Data Graph
atomicity requirement, the server runner owns the complete transaction boundary, generated clients
preserve the contract, and React/Explorer report whether the current runtime can execute locally,
bridge to an authority, or cannot satisfy the requirement.
