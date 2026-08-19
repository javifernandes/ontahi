---
id: ontahi.model.relation
kind: concept
title: Relation
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.domain-topology-graphos
relatedPlans:
  - bookops://plans/71a-ontahi-relations-model-research
  - ontahi://plans/125-ontahi-reference-fields
  - ontahi://plans/131-ontahi-relationship-semantics
  - ontahi://plans/131a-relationship-command-delta-core-experiment
  - ontahi://plans/128c-relationship-command-wire-protocol
migratedFrom: bookops://atlas/model/relation
sourceCommit: 67713696
---

A [[ontahi.model.relation|Relation]] names an edge between two
[[ontahi.model.entity|Entities]]. It is graph topology, not a storage join.

A reference stored by one Entity is declared as a Reference Field:

```ts
const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: field.id(),
    list: field.ref(TodoList),
  },
});
```

This single declaration gives `TodoItem.list` two compatible roles. As Entity data it is a
[[ontahi.model.ref|Ref]] and can participate in a [[ontahi.model.selection|Selection]]. In a Query
`include`, it is the named `belongsTo` edge and materializes the referenced TodoList at the same
result path. Query clause proxies keep those roles unambiguous.

An inverse collection is not stored on the source Entity. It points back through a target Reference
Field:

```ts
relations: () => ({
  tagAssignments: relation.inverse(TodoTag.fields.todo),
});
```

The target field supplies the related Entity and join evidence. The inverse contributes the domain
name and `hasMany` cardinality. Deferred `entity.ref(...)` targets keep cyclic graphs independent of
declaration order.

Providers lower Reference Fields to their physical representation. A conventional relational
mapping may store `TodoItem.list` in `todo_items.list_id`; another provider can choose a different
shape. Explicit `belongsTo`, `hasMany`, and physical mappings remain compatibility and
advanced-mapping surfaces.

Relation-root navigation consumes the source [[ontahi.model.selection|Selection]] directly:

```ts
commands.relatedTo(list).orderBy(item => item.title);
```

The Selection already names its source Entity and membership. When one declared Relation connects
that Entity to the command Entity, Ontahí infers the edge in either direction. If several edges
connect the same pair, `{ through: 'relationName' }` makes that genuine topology choice explicit;
if none connect them, construction fails before the read reaches storage.

Plan 131 recommends a narrow B-lite distinction between Relation Definitions, concrete relationship
facts, structural Relationship Commands, resolved deltas, and Association Entities. A direct
Relation owns topology, cardinality, nullability, target compatibility, and the structural
`link/unlink` action pair. Authoring may present those actions as to-one `assign/clear` and inverse
to-many `add/remove`, but both directions preserve one canonical Relation identity.

Authoring forms need not erase meaningful preconditions. `student.course.clear()` means unlink any
current target, while `course.students.remove(student)` names the expected target and must not erase
a concurrent reassignment. They share canonical Relation identity and `unlink` action; the applied
Relationship Delta records the exact fact actually removed.

A Relation does not own arbitrary lifecycle hooks, domain failures, effects, authorization
coordination, or durability. Those remain with Domain Operations. When the relationship has
attributes, identity, lifecycle, history, policy, effects, more than two roles, or participation in
further Relations, model it as an ordinary Association Entity.

The canonical Relationship Command has a versioned JSON-safe graph-command envelope. A receiving
runtime resolves its Entity names and Reference Field identity against server-owned topology,
validates endpoint Refs and declared locators, and drops unknown envelope metadata. The wire form
contains no executable functions, provider mappings, authority claims, or Entity patch fallback.
