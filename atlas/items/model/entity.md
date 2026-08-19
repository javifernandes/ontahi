---
id: ontahi.model.entity
kind: concept
title: Entity
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.domain-topology-graphos
  - bookops.model
typeOf:
  - spec-workstream-atlas.atlas-model.model-item
relatedPlans:
  - bookops://plans/71-ontahi-bookops-semantic-model-convergence
  - bookops://plans/71a-ontahi-relations-model-research
  - bookops://plans/71b-unified-entity-capability-lift
  - bookops://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/122-ontahi-developer-book
  - ontahi://plans/125-ontahi-reference-fields
  - ontahi://plans/131-ontahi-relationship-semantics
  - ontahi://plans/131a-relationship-command-delta-core-experiment
exemplars:
  - bookops.model.book
  - bookops.model.paragraph
migratedFrom: bookops://atlas/model/entity
sourceCommit: 67713696
---

An [[ontahi.model.entity|Entity]] is a named domain thing with
[[ontahi.model.identity-and-locator|identity]],
[[ontahi.model.relation|Relations]], operations, policies, and evidence across runtime boundaries.

An Entity defines the universe over which a [[ontahi.model.selection|Selection]] describes membership.

The conventional identity is declared at the [[ontahi.model.field|Field]] itself. An exact, required
`id: field.id()` field gives the Entity a `refById` locator and makes it the default identity:

```ts
const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
  },
});
```

This convention does not apply to other id-shaped fields such as `bookId`. Alternate locators merge
with it, so declaring `refBySlug: 'slug'` retains `refById` as the identity. Composite identities,
non-conventional primary fields, and a different default identity remain explicit through
`locators` and `identity`.

BookOps entities such as [[bookops.model.book|Book]] and [[bookops.model.paragraph|Paragraph]] are concrete pressure tests for whether Ontahi's entity language is clear and framework-shaped.

Unified entity declarations include named `belongsTo` and `hasMany` relationships. Immediate declarations preserve existing physical mapping setup; deferred declarations are prepared by the application composition root before entity operations are bound. This boundary intentionally does not yet define relation identity, relation-owned behavior, or enriched read models.

The unified declaration also owns typed `display` metadata for reflective labels/search and typed `freshness` metadata for normalized client-cache reconciliation. Both delegate to the original schema representation, so Explorer and cache consumers observe one model rather than a compatibility projection.

Application binding may additionally expose typed derived-value identities through `values`.
`valueRef()` declares only a deterministic key tuple; binding supplies the entity and value names,
producing factories such as `Book.values.chapter(input)`. These identities currently connect
server operation cache dependencies and mutation invalidation. They remain distinct from persisted
entity locators, normalized-client `freshness`, and bridge/React invalidation.

A relationship may provide a local `via` field as semantic storage evidence, such as
`list: relation.belongsTo(TodoList, { via: 'listId' })`. When the related Entity has a
single-field identity, relation-root reads can navigate that evidence directly. Provider bindings
can also use it to infer a foreign-key mapping without placing SQL table or column names in the
entity.

Reference Fields are the intended semantic evolution of that bridge. A declaration such as
`list: field.ref(TodoList)` keeps the target Entity in the Field itself, carries a Ref in the
Entity value, and lets storage providers lower it to their physical foreign-key representation.
An included Query may materialize the target at the same result path. Existing scalar `listId`
fields and explicit relations remain the incremental migration surface.

An Association Entity is an ordinary Entity whose required construction input and identity include
the participants it associates. Creating an `Enrollment(student, course, startedAt, status)` creates
that association instance; deleting it extinguishes the association; updating it evolves the
association's own lifecycle. This is a semantic classification, not an `AssociationEntity`
superclass or a Relation with Entity hooks.

That structural lifecycle is provided by Ontahi. The framework derives and validates required
participant Refs during generic Entity construction and provides generic deletion of the
association instance; each application must not recreate those mechanics as custom Operations. A
Domain Operation is added only for domain-specific invariants, authorization, effects, failures, or
coordination beyond the structural lifecycle.

Direct Relations and Association Entities are observationally polymorphic: both can project
relationship facts for traversal, policy input, and telemetry. Their mutation semantics remain
distinct. Direct edges use structural Relationship Commands; a reified association uses ordinary
Entity creation, update, deletion, and any Domain Operations required by its invariants or effects.
