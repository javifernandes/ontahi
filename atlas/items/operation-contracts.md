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
  - ontahi://plans/142a-existing-operation-contract-compatibility-baseline
migratedFrom: bookops://atlas/operation-contracts
sourceCommit: 67713696
---

Operation Contracts cover inputs, results, validation, schemas, operation invocation, and the way UI, server, and LLM agents can talk about executable work.

The current server Operation surface includes code-bearing `contracts.pre` and `contracts.post`
callbacks. Each accepts one check or an ordered array; checks may be synchronous, Promise-valued,
or Effect-valued and may produce `OperationFailure` values. Pre-checks run before the body.
Post-checks receive the successful result after the body. For an ordinary Operation, a failure
changes the Operation result but does not roll back effects already performed. In an
`operation.atomic(...)`, requirements, pre-checks, body, and post-checks execute inside the same
Data Graph transaction, so a post failure rolls that boundary back.

This surface predates schema-native Ref hydration, UnitOfWork, portable Relation constraints, and
compositional Data Graph transactions. Its only repository use is focused Core tests and developer
documentation, not executable application behavior. Plan 142a characterized it at the public
Domain Operation runner: callbacks receive portable normalized Refs while the body receives its
separate runtime-bound Ref facade; ordinary pre, body, and post phases share one UnitOfWork; and a
post failure neither rolls back body effects nor reopens an explicit Data Graph transaction that
already committed.

The alpha compatibility decision is to keep the callback-valued top-level property working until a
portable replacement ships, while treating it as deprecated design rather than the enduring model.
Opaque server-only checks remain available through the explicit `contract(...)` Layer Concern,
whose ordering and non-portability are honest. Plan 142 may then reuse the established
`contracts.pre` / `contracts.post` categories for one reflected declarative vocabulary instead of
adding a callback/object union or a parallel pre/postcondition namespace. The replacement slice,
not the characterization slice, owns the public removal, migration Changeset, and final type
surface.

## Child Items

1. [`Operation Inputs`](./operation-contracts/operation-inputs.md)
2. [`Operation Results`](./operation-contracts/operation-results.md)
3. [`Graph-Native Schema DSL`](./operation-contracts/graph-native-schema-dsl.md)
