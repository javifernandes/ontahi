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
  - ontahi://plans/74b-schema-native-operation-refs
  - ontahi://plans/139d-postgres-classroom-transfer
  - ontahi://plans/142c-reflected-atomic-operation-execution
  - ontahi://plans/142d-existing-operation-refs
---

A UnitOfWork is the server runtime identity boundary shared by one top-level invocation/Operation
and normally nested Operations. It names the existing runtime resource scope so graph execution,
authority, memoized loaders, Ref resolution, invalidation, and optional provider sessions can
coordinate without becoming properties of an Entity, Relation, Ref, Query, or Command.

`UnitOfWork.refs` is the server-side identity map for resolved Refs. Its key combines normalized
portable Ref identity, resolver identity, and execution identity (`principal` plus `cacheScope`),
keeping distinct projections and authorization boundaries separate even when nested invocation
contexts share runtime resources. Effect-valued resolvers are memoized at execution time, including
in-flight work. Repeated explicit `book.resolve()` calls on a schema-native Operation input in one
scope therefore reuse one authorized Query result; separate top-level invocations do not.

An `existingRef` input uses that same store automatically. Several fields carrying the same Ref and
resolver materialize once in the UnitOfWork, while each body value preserves the original portable
identity as `.ref`. This is a resolution requirement on an immediate Operation input, not a
cross-request identity map or permission shortcut.

The UnitOfWork does not authorize or materialize a Ref by itself. Application Ref resolvers still
build Queries and execute them through the active Data Graph runtime and graph-read policy. The
store only retains their result. Ordinary Operation code uses `book.invalidate()` and
`book.refresh()` rather than reaching through `app.runtime.unitOfWork`; the lower-level
`refs.invalidate(ref)` capability remains the mechanism beneath those methods. Automatic
Command-driven invalidation remains future work until Ontahi has declared evidence for affected
Ref identities.

The first implemented facade exposes the current scope's typed resource API. Repeated access over
the same resource map returns the same UnitOfWork identity. A child UnitOfWork starts with inherited
resource values but owns a distinct map, so a local override does not mutate its parent or a
concurrent sibling.

A database transaction is one possible child UnitOfWork lifetime; it is not another name for
UnitOfWork. The lower-level `app.graph.transaction(effect)` API asks the current Data Graph runtime
for its optional transaction capability. A Domain Operation normally expresses the semantic
guarantee with `operation.atomic({...})`, allowing its runner to establish the same boundary before
evaluating requirements, checks, or body code. Either path installs the returned connection-scoped
runtime only in an isolated child UnitOfWork. Bound Queries and explicit Command `.run()` calls
discover that runtime from context, including normally nested Operations. The child starts with a
fresh Operation-result cache so reads observed before rollback cannot leak into its parent. Success,
typed failure, and defect all restore the parent scope.

The provider-backed Classroom proof exercises that boundary from an atomic Domain Operation.
`Student.transfer(...)` declares three `existingRef` participants, conditionally changes one
Relation, and receives no transaction runtime parameter or manual `resolve()` calls. Its
`Course.students` count constraint reuses that transaction context, serializes contenders on the
destination Course, and rejects prospective membership before changing the edge. The virtual
capacity Fields then observe the committed Relation state; no counter rows are coordinated by the
Operation body.

Command construction remains pure and portable. Entering a UnitOfWork or transaction never makes
construction execute a Command implicitly. The explicit execution marker is `.run()`; context only
chooses which runtime performs it.

Supabase/PostgREST can participate in the ordinary UnitOfWork resource and future Ref-resolution
scope, but multiple client requests cannot share database rollback. Its individual Relationship
Command RPCs remain atomic while contextual compositional transaction work fails before evaluation
when the active runtime does not advertise the capability.

Child UnitOfWorks own fresh Ref-resolution stores. A transaction therefore cannot leak values read
through its scoped runtime into the restored parent after commit or rollback. Durable workflow
steps and browser/client normalized caches remain separate future boundaries; the server store is
neither cross-request cache nor hidden property-triggered I/O.
