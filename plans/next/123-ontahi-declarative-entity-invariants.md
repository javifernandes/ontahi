# 123. Ontahi Declarative Entity Invariants

Status: next

Canonical ID: `ontahi://plans/123-ontahi-declarative-entity-invariants`

Migrated from: `bookops://plans/123-ontahi-declarative-entity-invariants`
Original path: `plans/next/123-ontahi-declarative-entity-invariants.md`
Source commit: `cb9c038a`

Source plan: [`122. Ontahi Developer Book`](../done/122-ontahi-developer-book.md)

Continues: [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)

Related plan: [`76a. Operation Input Constraints And Client Validation`](./76a-operation-input-constraints-and-client-validation.md)

## Summary

Model invariants whose truth depends on persisted Entity state, beginning with uniqueness. Keep
them declarative, reflected, and enforceable at the atomic storage boundary instead of presenting a
query-based operation precondition as the guarantee.

## Context

The developer book exposed two different kinds of admissibility:

1. a closed input rule such as “TodoList name is not `archive`” is knowable from the value and now
   belongs to a reflected field constraint;
2. “no other TodoList uses this name” depends on current state.

An executable `contracts.pre` check can give a useful domain failure before the command body, but
two concurrent operations can both observe absence and then insert. Today the real uniqueness
guarantee remains a provider-specific database constraint, and Ontahi has no declarative Entity
surface connecting that guarantee to reflection and operation failure semantics.

## Scope

1. Define a graph-native Entity uniqueness invariant over one or more fields.
2. Decide how normalization and case sensitivity participate in identity comparison.
3. Reflect the invariant for Explorer, generated clients, and tooling.
4. Give storage adapters enough metadata to validate mappings and classify constraint violations.
5. Translate a uniqueness violation into one stable expected operation failure.
6. Add in-memory, PostgreSQL, and Supabase conformance coverage.
7. State what remains host-owned when migrations and physical indexes are not generated.

## Non-Goals

1. Inferring or applying production migrations in the first slice.
2. Replacing operation preconditions that improve feedback before an attempted write.
3. Modeling every aggregate, temporal, or distributed invariant as a storage constraint.
4. Promising global uniqueness across independent storage systems.

## Illustrative Direction

The final spelling is open. The semantic shape should remain close to:

```ts
entity({
  name: 'TodoList',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
  },
  invariants: {
    uniqueName: invariant.unique(['name'], {
      failure: {
        reason: 'todo_list_name_taken',
        message: 'A TodoList already uses that name.',
      },
    }),
  },
});
```

The declaration is the semantic source. A physical unique index may remain a host-owned migration
artifact, but its mapping and failure classification must be checked against this invariant.

## Execution Slices

- [ ] Inventory current unique indexes, conflict translation, and adapter error shapes.
- [ ] Decide the Entity authoring and reflection contract.
- [ ] Implement in-memory atomic enforcement as the reference behavior.
- [ ] Bind PostgreSQL and Supabase constraint violations to the invariant.
- [ ] Expose one canonical operation failure without leaking provider error details.
- [ ] Reflect the invariant in Explorer and generated application metadata.
- [ ] Add concurrency and adapter-conformance tests.

## Verification

- [ ] Concurrent writes cannot violate a declared uniqueness invariant.
- [ ] Every active storage adapter reports the same semantic failure.
- [ ] Reflection identifies invariant name, fields, and public failure contract.
- [ ] Hosts retain explicit ownership of migrations and physical naming.
- [ ] Query-based preconditions are documented as early feedback, not atomic enforcement.

## Decisions

1. Input-local admissibility stays in schemas; persisted-state invariants are a separate model.
2. A precondition may improve feedback but cannot be the uniqueness authority.
3. Provider constraint names and raw errors must not become domain vocabulary.

## Open Questions

1. Does normalization belong to the field schema, the invariant, or a derived persisted field?
2. Should a declared invariant require an explicit physical constraint mapping in production?
3. Can the same invariant drive optimistic client checks without implying client authority?
