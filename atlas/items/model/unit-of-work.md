---
id: ontahi.model.unit-of-work
kind: concept
title: Unit Of Work
parent: ontahi.model
status: active
horizon: now
relatedPlans:
  - ontahi://plans/74a-unit-of-work-runtime-scope
  - ontahi://plans/139a-composable-data-graph-transactions
  - ontahi://plans/139b-transaction-scoped-unit-of-work
---

A UnitOfWork is the server runtime identity boundary shared by one top-level invocation/Operation
and normally nested Operations. It names the existing runtime resource scope so graph execution,
authority, memoized loaders, Ref resolution, invalidation, and optional provider sessions can
coordinate without becoming properties of an Entity, Relation, Ref, Query, or Command.

The first implemented facade exposes the current scope's typed resource API. Repeated access over
the same resource map returns the same UnitOfWork identity. A child UnitOfWork starts with inherited
resource values but owns a distinct map, so a local override does not mutate its parent or a
concurrent sibling.

A database transaction is one possible child UnitOfWork lifetime; it is not another name for
UnitOfWork. `app.graph.transaction(effect)` asks the current Data Graph runtime for its optional
transaction capability, then installs the returned connection-scoped runtime only in an isolated
child UnitOfWork. Bound Queries and explicit Command `.run()` calls discover that runtime from
context, including normally nested Operations. The child starts with a fresh Operation-result cache
so reads observed before rollback cannot leak into its parent. Success, typed failure, and defect
all restore the parent scope.

Command construction remains pure and portable. Entering a UnitOfWork or transaction never makes
construction execute a Command implicitly. The explicit execution marker is `.run()`; context only
chooses which runtime performs it.

Supabase/PostgREST can participate in the ordinary UnitOfWork resource and future Ref-resolution
scope, but multiple client requests cannot share database rollback. Its individual Relationship
Command RPCs remain atomic while contextual compositional transaction work fails before evaluation
when the active runtime does not advertise the capability.

Runtime-scoped Ref resolution reuse and explicit invalidation remain the next Plan 74a slices. They
must not become cross-request cache or hidden property-triggered I/O.
