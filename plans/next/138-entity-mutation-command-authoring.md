# 138. Entity Mutation Command Authoring And Lifecycle Ergonomics

Status: next

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
5. Define direct/server and generated-client types before extending the remote bridge in Plan 128.
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

- [ ] One concise authoring vocabulary covers create, update, and delete without duplicate concepts.
- [ ] Entity and Ref methods are fully typed and remain non-enumerable local bindings where needed.
- [ ] Serialized Commands and Refs contain data only.
- [ ] Association Entity construction requires canonical participant Refs generically; loaded,
      detached, unsaved, and full-record inputs are rejected rather than serialized implicitly.
- [ ] Update/delete commands define portable revision or conditional preconditions and structured
      stale, replaced, and missing-target outcomes.
- [ ] Direct execution and future remote command types preserve identical concurrency semantics.
- [ ] Existing `insert` and Selection mutation compatibility has an explicit migration decision.
- [ ] Plan 128 owns any remote transport rather than the authoring facade inventing one.

## Open Questions

1. Should `insert` remain the canonical creation verb while `create` belongs only to outcomes or
   lifecycle language?
2. Does `ref.delete()` communicate a command target more clearly than
   `Entity.selection(...).delete()` for exact identity?
3. Which runtimes can guarantee revision evidence, and what conditional fallback exists when they
   cannot?
4. Which surface belongs in generated browser clients before generic remote Entity Commands exist?
