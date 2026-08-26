# 74a. Unit Of Work Runtime Scope

Status: done

Canonical ID: `ontahi://plans/74a-unit-of-work-runtime-scope`

Migrated from: `bookops://plans/74a-unit-of-work-runtime-scope`
Original path: `plans/next/74a-unit-of-work-runtime-scope.md`
Source commit: `4942eb2f4b0fc5a3e9c91e0e7bdc7964e95a876e`

## Summary

This plan promotes the implicit server operation resource boundary into an explicit `UnitOfWork`.

The first useful `UnitOfWork` is not a database transaction abstraction. It is the runtime scope that lets entity refs, operation resources, memoized loaders, and future transaction/session handles share one identity boundary.

> [!FUTURE]
> target: [[ontahi.model.unit-of-work|Unit Of Work]]
> UnitOfWork should become the named runtime boundary for ref resolution, in-flight reuse, explicit invalidation, and future transaction/session handles.

## Context

Entity refs can exist without a `UnitOfWork`, and they already do.

The missing part is runtime coordination:

1. repeated `ref.resolve()` calls inside one operation should share one loader execution,
2. nested operations should reuse the parent runtime scope,
3. mutations should be able to evict resolved refs explicitly,
4. workflow/task steps should later establish their own retry-safe scope,
5. server context resources should stop feeling like an unnamed bag of string keys.

Source plans:

1. [74. Entity Refs And Graph Operations](bookops://plans/74-entity-refs-and-unit-of-work)
2. [64. Hierarchical Server Runtime Resources](bookops://plans/64-hierarchical-server-runtime-resources)
3. [68h. Runtime Context Resources And Cache API](bookops://plans/68h-runtime-context-resources-and-cache-api)
4. [63a. Operation-Native Cache Tags And Invalidation](bookops://plans/63a-operation-native-cache-tags-and-invalidation)

## Research / Evidence

Current runtime pressure appears in:

1. `packages/core/src/runtime/server/operation/runner.ts` in the Ontahi repository
2. `packages/core/src/runtime/server/app-facade.ts` in the Ontahi repository
3. `packages/core/src/runtime/server/data-graph-app-adapter.ts` in the Ontahi repository
4. `packages/core/src/runtime/server/operation` in the Ontahi repository
5. `packages/core/src/data-graph/ref.ts` in the Ontahi repository
6. `bookops://web/src/architecture/runtime/server.test.ts`

Existing adjacent mechanisms:

1. `ServerUseCaseContext.resources` already acts like a runtime resource map.
2. Nested server operations already reuse parent resources.
3. `ServerRuntimeValueRef` already powers operation result cache tags.
4. React Query and graph client cache handle client-side identity separately.

The useful design pressure is not to merge every cache system immediately. It is to give server-side ref resolution its own explicit scope first.

## Scope

This plan covers the first server-side `UnitOfWork` facade.

It includes:

1. a typed runtime resource API over the existing resource map,
2. request/server-operation scope creation,
3. nested operation scope reuse,
4. a runtime-scoped entity-ref resolution store,
5. stable ref normalization for resolution keys,
6. explicit resolved-ref invalidation.

## Non-Goals

Do not introduce cross-request cache.

Do not perform hidden property-triggered I/O.

Do not add a database transaction/session API in the first slice.

Do not merge with `ServerRuntimeValueRef` operation result cache tags yet.

Do not merge with React Query or normalized graph client cache.

Do not require workflow/task or browser UnitOfWork support in the first slice.

## Proposed Form

The first API can be small:

```ts
type UnitOfWork = {
  resources: ServerContextResourceApi;
  refs: {
    resolve<T>(
      ref: EntityRef,
      options: {
        key?: string;
        load: () => Promise<T> | T;
      },
    ): Promise<T>;
    invalidate(ref: EntityRef): void;
  };
};
```

Resolution semantics:

```ts
const bookRef = Book.ref({ slug: 'progbook' });

const first = await uow.refs.resolve(bookRef, {
  load: () => fetchBookBySlug('progbook'),
});

const second = await uow.refs.resolve(bookRef, {
  load: () => fetchBookBySlug('progbook'),
});

first === second;
```

Invalidation semantics:

```ts
await updateBookTitle(book.id, 'New title');
uow.refs.invalidate(bookRef);
```

The first implementation evicts. It does not automatically refresh.

## Execution Slices

1. Add `packages/core/src/runtime/server/unit-of-work.ts` in the Ontahi repository.
2. Back the first facade with the existing server operation resource map.
3. Export `getCurrentUnitOfWork()` and `getRequiredUnitOfWork()`.
4. Add an `app.runtime.unitOfWork` or equivalent facade namespace.
5. Add a ref-resolution store resource.
6. Normalize entity refs into stable resolution keys.
7. Wire operation/server-effect execution to create or reuse the current UoW.
8. Make `refs.book.resolve()` use UoW-backed resolution when configured.
9. Add explicit resolved-ref invalidation.
10. Defer task/workflow and client-side UoW scopes.

## Verification

- [x] Repeated resolves of the same ref in one top-level operation share one loader execution.
- [x] Separate top-level operation executions do not share ref-resolution cache.
- [x] Nested operations reuse the parent UoW.
- [x] Explicit invalidation evicts a resolved ref.
- [x] Existing operation result cache tag behavior remains unchanged.
- [x] Existing client query/cache behavior remains unchanged.
- [x] UoW does not introduce hidden property-triggered I/O.

## Decisions

`UnitOfWork` is the runtime concept that should gradually absorb/promote current use-case context responsibilities.

The first UoW scope is server operation scoped.

Manual invalidation comes before automatic graph-command invalidation.

Operation result cache tags and client query invalidation stay separate in this slice.

Durable workflow steps should later get fresh UoW boundaries per step/retry.

## Closure / Evolution

This plan is complete.

`UnitOfWork.refs` owns a normalized, operation-scoped resolution store. Server Domain Operation
input Refs delegate their explicit `resolve()` method to that store. Effect-valued resolvers are
memoized at execution time, so concurrent callers share the authorized Query rather than merely
sharing an unevaluated Effect value. Promise and synchronous loaders share the same store contract.

The cache key combines portable Ref identity, resolver identity, and execution identity (`principal`
plus `cacheScope`). This prevents a summary projection, a detail projection, or a differently
authorized nested invocation from satisfying each other while still allowing normally nested
Operations that preserve both resolver and authority to share work. Resolver-backed derived Refs
are separate runtime objects, so attaching two representations never mutates or overwrites the
portable Ref supplied by the caller.

`UnitOfWork.refs.invalidate(ref)` evicts every representation for that normalized Ref. Reload is
explicit on the next `resolve()`. Automatic invalidation remains intentionally deferred: arbitrary
Graph Commands do not provide enough evidence to infer every affected Ref safely, and Relation
Commands should gain invalidation only through a later declared consistency contract.

The default application Data Graph Ref resolver continues to construct a Query and execute it
through the active runtime. UnitOfWork stores only that authorized resolver result; it does not
duplicate Query or policy logic. Child UnitOfWorks, including transaction scopes, own fresh stores,
which prevents values observed under a scoped runtime or rolled-back transaction from leaking into
the parent. Durable tasks and browser/client caches remain outside this slice.

Delivery verification:

1. Complete Core coverage suite: 85 files and 589 tests passed; 89.22% statements and 79.5%
   branches.
2. All ten package typechecks and the TodoApp codegen/typecheck passed.
3. Repository lint and formatting passed.
4. All ten packages built and passed clean-room artifact install, public type, and runtime checks.
5. Public Core evolution is recorded in `.changeset/wise-refs-reuse.md`; durable semantics are
   recorded in `ontahi://atlas/model/unit-of-work` and this completed Plan.

Related evolution:

1. [74. Entity Refs And Graph Operations](bookops://plans/74-entity-refs-and-unit-of-work)
2. [74c. Normalized Graph Client Cache](bookops://plans/74c-normalized-graph-client-cache)
3. [74d. Graph Client Cache Rollout And Devtools](bookops://plans/74d-graph-client-cache-rollout-and-devtools)
4. [68h. Runtime Context Resources And Cache API](bookops://plans/68h-runtime-context-resources-and-cache-api)

## 2026 Ontahi Evolution

Plan 139a later proved an optional provider-owned transaction runtime. That does not invalidate the
original decision above: UnitOfWork remains the wider runtime identity and is not synonymous with a
database transaction.

[139b. Transaction-Scoped Unit Of Work](../done/139b-transaction-scoped-unit-of-work.md) completed a
small first intervention from this plan. It named the existing resource identity, proved isolated
child scopes, and let a provider transaction install its connection-scoped Data Graph runtime in
one child. This closing slice adds Ref-resolution reuse and explicit invalidation to that boundary.

Related current work:

1. [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)
2. [139a. Composable Data Graph Transactions](../done/139a-composable-data-graph-transactions.md)
