---
id: ontahi.operation-contracts
kind: system-primitive
title: Operation Contracts
parent: ontahi
status: in-progress
horizon: now
supports:
  - ontahi
  - bookops
  - bookops.semantic-editorial-experience
relatedPlans:
  - ontahi://plans/142-declarative-model-semantics-and-execution-planning
migratedFrom: bookops://atlas/operation-contracts
sourceCommit: 67713696
---

Operation Contracts cover inputs, results, validation, schemas, operation invocation, and the way UI, server, and LLM agents can talk about executable work.

The current server Operation surface includes code-bearing `contracts.pre` and `contracts.post`
callbacks. Each accepts one check or an ordered array; checks may be synchronous, Promise-valued,
or Effect-valued and may produce `OperationFailure` values. Pre-checks run before the body.
Post-checks receive the successful result after the body; a failure changes the Operation result but
does not roll back effects already performed.

This surface predates schema-native Ref hydration, UnitOfWork, portable Relation constraints, and
compositional Data Graph transactions. Its only repository use is focused Core tests and developer
documentation, not executable application behavior. Plan 142 must therefore characterize it before
adding declarative conditions: evolve the existing semantic categories compatibly or deprecate the
anticipatory callback API explicitly, but do not create a parallel pre/postcondition namespace.

## Child Items

1. [`Operation Inputs`](./operation-contracts/operation-inputs.md)
2. [`Operation Results`](./operation-contracts/operation-results.md)
3. [`Graph-Native Schema DSL`](./operation-contracts/graph-native-schema-dsl.md)
