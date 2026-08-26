# 139b. Transaction-Scoped Unit Of Work

Status: done

Canonical ID: `ontahi://plans/139b-transaction-scoped-unit-of-work`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

Advances: [74a. Unit Of Work Runtime Scope](./74a-unit-of-work-runtime-scope.md)

## Summary

Lift Plan 139a's explicit provider primitive into an application-facing transaction scope. Code
inside `app.graph.transaction(effect)` continues to execute Queries and Commands explicitly, but
their bound `.run()` methods resolve the transaction runtime from the current child UnitOfWork.

```ts
const transition = Effect.gen(function* () {
  yield* app.graph.transaction(
    Effect.gen(function* () {
      yield* student.course.assign(nextCourse, { ifCurrent: previousCourse }).run();
      yield* updateCourseCapacity.run();
    }),
  );
});
```

## Risk To Prove

The current callback parameter is honest but low-level:

```ts
runtime.transaction(tx => tx.runRelationshipCommand(command));
```

Ontahi already resolves bound graph execution through the active server runtime context. Rebinding
that context by mutating its shared resource `Map`, however, could leak a checked-out transaction
runtime to the parent operation or a concurrent sibling. The smallest useful proof is an isolated
child UnitOfWork whose inherited resources are readable, whose overrides are local, and whose
runtime is restored after success or failure.

## Scope

1. Name the existing server-operation resource identity as `UnitOfWork`.
2. Preserve UnitOfWork identity across nested Operations that share the same resource map.
3. Add an isolated child scope with inherited resource values and local overrides.
4. Add an application-facing Data Graph transaction Effect that installs the provider's scoped
   runtime in that child.
5. Bind direct and many-to-many Relationship Commands to explicit `.run()` execution.
6. Preserve the low-level `runtime.transaction(tx => ...)` provider contract.
7. Fail clearly before executing work when the current runtime lacks the optional capability.

## Non-Goals

1. Do not execute a Command merely because it was constructed.
2. Do not add transaction metadata to Relation or to a portable Command.
3. Do not emulate shared rollback across Supabase/PostgREST requests.
4. Do not transport callbacks or arbitrary code through the Data Graph bridge.
5. Do not add nested transactions, savepoints, retries, or isolation-level authoring.
6. Do not add Ref-resolution caching or invalidation in this slice.
7. Do not register or execute Reactions in the transaction automatically.

## Acceptance Checklist

- [x] A top-level server Operation exposes one stable UnitOfWork identity.
- [x] A normally nested Operation observes the same UnitOfWork.
- [x] A child UnitOfWork inherits resources while local changes do not mutate its parent.
- [x] Concurrent child scopes cannot observe each other's Data Graph runtime override.
- [x] `app.graph.transaction(effect)` routes bound reads and Graph Commands through the provider's
      transaction runtime without exposing `tx` to application code.
- [x] Direct and many-to-many Relationship Commands returned from bound Entity Refs expose `.run()`
      and resolve their runtime lazily.
- [x] The parent runtime is restored after transaction success, typed failure, or defect.
- [x] A runtime without transaction capability fails before evaluating transaction work.
- [x] Supabase continues to advertise only single-Relationship-Command RPC atomicity.
- [x] Focused tests, affected package suites, typecheck, lint, formatting, and artifact verification
      pass.
- [x] Public changes include a Changeset and durable UnitOfWork/Relation documentation is updated.

## Split Point

Stop this pull request once contextual transaction routing and executable bound Relationship
Commands are proven. Ref-resolution reuse/invalidation, Reaction registration, and Classroom remain
separate slices.

## Delivery

`UnitOfWork` now names the stable facade over one server-operation resource map. Normally nested
Operations keep that identity. `withChildUnitOfWork(...)` snapshots inherited resource entries into
an isolated map and runs the child Effect under its own async context, preserving Effect
requirements, typed failures, defects, and interruption cleanup while restoring the caller's
context.

`app.graph.transaction(effect)` resolves the current runtime's optional transaction capability and
installs the returned runtime in one child UnitOfWork. A private transaction-scope resource marker
prevents normally configured Data Graph concerns in nested Operations from replacing the checked-
out runtime. The child isolates the Operation-result cache so rolled-back observations cannot leak
to the parent. Missing capability produces `DataGraphTransactionUnavailableError` before the work
Effect is evaluated.

Runtime-bound Entity Refs now produce direct and many-to-many Relationship Commands with a
non-enumerable `.run()` method. The executor resolves the current runtime lazily, so the same bound
command surface follows the transaction context while the canonical enumerable/serialized Command
remains unchanged.

PostgreSQL proves that two bound application Commands execute and commit through the contextual
transaction facade. Supabase explicitly remains non-transactional at the compositional capability
level while retaining single-command RPC atomicity.

## Verification

1. Focused Core UnitOfWork, adapter, bound Relation, direct Relation, and many-to-many suites: 5
   files and 31 tests passed.
2. Complete Core suite: 82 files and 570 tests passed.
3. Complete PostgreSQL suite: 8 files and 69 tests passed, including the real PostgreSQL contextual
   transaction integration.
4. Complete Supabase suite: 7 files and 51 tests passed, including RPC integration.
5. All ten package typechecks passed.
6. Repository lint and formatting passed.
7. All ten packages built and passed clean-room artifact install, public type, and runtime checks.
8. Public Core evolution is recorded in `.changeset/fresh-scopes-compose.md`; durable semantics are
   recorded in `ontahi://atlas/model/unit-of-work` and `ontahi://atlas/model/relation`.
