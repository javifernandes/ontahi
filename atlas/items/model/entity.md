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
  - ontahi://plans/71-ontahi-bookops-semantic-model-convergence
  - ontahi://plans/71a-ontahi-relations-model-research
  - bookops://plans/71b-unified-entity-capability-lift
  - ontahi://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/125-ontahi-reference-fields
  - ontahi://plans/131-ontahi-relationship-semantics
  - ontahi://plans/131a-relationship-command-delta-core-experiment
  - ontahi://plans/152-discriminated-entity-variants
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

Planned discriminated variants would name a classified population, such as Chapter within
ContentNode, as a schema target while retaining the base Entity's canonical identity and storage.
This is distinct from a reusable Selection factory or a View: classification membership must be
enforced by the runtime, not just expressed by a caller's filter or label. Plan 152 follows the
contextual Selection factory work. An experimental `.variant(...)` local read declaration now
exists, but variants are not yet general-purpose Entity schema/Operation targets.

The first executable contract experiment separates the classification/schema target from the
canonical base identity. A base-named Ref is not evidence of classification: the receiving schema
must enforce the required discriminator and base/variant authority without leaking inaccessible
membership. Lowering to base Selections preserves one storage population and cache record; renaming
an ordinary Entity does not. The initial direction is fixed classification, with generic
discriminator writes guarded before public exposure. The subsequent local read facade separates relative Selection membership from the variant
universe: complement/union compose first, and lowering applies the discriminator outside that
expression. It reuses base identity/storage and does not imply portable variant policy or writes.

The next bounded implementation supports `graphSchema.existingRef(Variant)` as a direct Operation
input: canonical base Ref in, classified base record out, checked before the body even with custom
resolvers. Reflection separates the classification descriptor from identity. Base resolution and
authorization remain host-owned. Graph discovery now exposes the input descriptor, and codegen
reconstructs static classified inputs on generated base schemas without server resolvers. Automatic
variant-specific policies and standalone variant exports remain pending. Registered Graph Read
roots now inherit their base policy; the receiver imposes classification outside caller NOT/OR
while preserving canonical base Refs. Capability discovery exposes these registrations as data.
The Console projects that catalog over base reflection for shared TS/declarative root, Field,
narrowed enum and factory completion before a data read. Contextual factories can now name a
variant destination with `self.nodes.as(Part)`, retaining the physical relation and canonical base
identity. Typed/code-generated read paths and Console navigation preserve every classified source
and destination; the v2 receiver enforces each universe and base scope. Classified hops from bound
sources now retain read-only runtime execution; standalone variants can be bound explicitly.
Composition and final read shaping preserve binding without adding writes. Explicit base Query
lowering feeds existing cache reconciliation: base and classified snapshots share canonical identity.
In-memory provider/Runtime Transport integration verifies reclassification across observed reads,
base cache identity and host-triggered React invalidation. Leaving a classified result is not a
global Entity deletion; confirmed-delete eviction and cache authority scope remain host-owned.
Live SQL change feeds, variant-root Views and the variant write/transition API remain pending.
This is not general-purpose variant schema support.

The [BookOps Chapter rehearsal](../../../docs/research/bookops-chapter-variants.md) distinguishes
an actual classified participant from a location DTO: resolving a Book/Part path does not prove
Chapter existence. Contextual factories can compose root/nested classified destinations across
fluent enrichment of the same base object; enrichment does not create a second identity. Host
adoption still owns authorization, hierarchy integrity, generated-client compatibility and the
guided selection interaction. Named Value inputs now preserve direct classified participants in
generated clients, including imported aliases, without emitting server resolvers. Separate Reader
Entities over one table are not automatically variants.

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
