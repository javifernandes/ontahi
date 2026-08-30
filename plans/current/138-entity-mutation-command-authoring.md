# 138. Entity Mutation Command Authoring And Lifecycle Ergonomics

Status: current

Canonical ID: `ontahi://plans/138-entity-mutation-command-authoring`

## Summary

Replace the provisional `mutateEntity(Entity).create/update/delete` spelling with an Entity- and
Ref-bound authoring surface consistent with Queries, ordinary Commands, Domain Operations, and
fluent Relationship Commands.

```ts
const createEnrollment = Enrollment.create({
  student: studentRef,
  course: courseRef,
  status: 'active',
});
const endEnrollment = enrollmentRef.delete();
```

The example is a design target, not an accepted API. Participant and target values are canonical
Refs. The first contract does not accept loaded, detached, or unsaved Entity objects and does not
silently normalize full records. Commands must remain portable semantic values; binding methods to
Entity or Ref facades must not embed runtime definitions or full Entity state into serialized
identity.

## Scope

1. Inventory current `insert`, Selection mutation, `mutateEntity`, Operation-returned Command, and
   runtime-bound execution surfaces before adding aliases.
2. Decide whether create/delete are universal Entity vocabulary or only facade authoring sugar over
   canonical Entity Mutation Commands.
3. Preserve required participant Ref inference for Association Entity construction.
4. Preserve exact Entity Mutation Deltas and Applied Mutation Outcomes.
5. Build Entity- and Ref-bound authoring over the canonical direct/server types proven by
   [Plan 128f](../done/128f-remote-identity-scoped-entity-mutation-commands.md), without creating
   another wire representation.
6. Keep structural Association Entity lifecycle framework-provided without introducing an
   `AssociationEntity` superclass.
7. Define optional revision or conditional preconditions for update/delete, including stale target,
   concurrent replacement, and missing target outcomes. Direct and future remote command types must
   preserve the same precondition fields and outcome semantics.

## Non-Goals

1. Do not copy ORM active-record semantics wholesale.
2. Do not make a Ref contain mutable Entity state.
3. Do not add remote generic CRUD before its default-deny authority model exists.
4. Do not collapse Entity lifecycle into Relationship Commands.

## Acceptance Checklist

- [x] One concise authoring vocabulary covers create, update, and delete without duplicate concepts.
- [x] Entity and Ref methods are fully typed and remain non-enumerable local bindings where needed.
- [x] Serialized Commands and Refs contain data only.
- [x] Association Entity construction requires canonical participant Refs generically; loaded,
      detached, unsaved, and full-record inputs are rejected rather than serialized implicitly.
- [ ] Update/delete commands define portable revision or conditional preconditions and structured
      stale, replaced, and missing-target outcomes.
- [ ] Direct execution and future remote command types preserve identical concurrency semantics.
- [x] Existing `insert` and Selection mutation compatibility has an explicit migration decision.
- [x] Plan 128 owns any remote transport rather than the authoring facade inventing one.

## Execution Slices

1. [138a. Client Entity Mutation Authoring](../done/138a-client-entity-mutation-authoring.md) adds the
   portable and runtime-bound Entity/Ref facade over the exact Command contract already proven by
   Plans 128f and 128g. It deliberately leaves concurrency preconditions unchanged.
2. [138b. Conditional Exact Entity Mutations](../next/138b-conditional-exact-entity-mutations.md)
   owns portable revision/conditional evidence and provider outcome semantics now that the
   authoring vocabulary is stable.

## Decisions And Remaining Questions

1. `insert` and Selection mutation remain the general server/runtime Command surface. `create` is
   the exact lifecycle verb on generated client Entity facades; `ref.update()` and `ref.delete()`
   distinguish exact identity from affected-set mutation.
2. Raw semantic Entities remain declarative metamodel values. Generated client facades own portable
   authoring, while runtime binding owns executable `.run()` without changing serialization.
3. Which runtimes can guarantee revision evidence, and what conditional fallback exists when they
   cannot?
4. How should missing, stale, and replaced targets remain diagnostically useful without leaking
   policy-filtered existence evidence?
