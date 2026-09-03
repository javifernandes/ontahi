# 71a. Experimental Entity Relations Bridge

Status: done

Canonical ID: `ontahi://plans/71a-ontahi-relations-model-research`

Migrated from: `bookops://plans/71a-ontahi-relations-model-research`
Original path: `plans/done/71a-ontahi-relations-model-research.md`
Source commit: `4b86f3c6`

Parent plan:

1. [71 Ontahi / BookOps Semantic Model Convergence](./71-ontahi-bookops-semantic-model-convergence.md)

Related plans:

1. [52 Typed Entity Graph v0](bookops://plans/52-typed-entity-graph-v0)
2. [65 Relation-Root Navigation Over Entity Relationships](bookops://plans/65-relation-root-navigation-over-entity-relationships)
3. [74 Entity Refs And Unit Of Work](bookops://plans/74-entity-refs-and-unit-of-work)
4. [77 Domain Topology And GraphOS Layers](ontahi://plans/77-domain-topology-and-graphos-layers)
5. [78 First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
6. [120 Ontahi Environment Resources And Semantic Bindings](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)

## Summary

Let BookOps express its existing relations through Ontahi's unified entity declaration without
making a complete relations model a prerequisite for migration.

BookOps already has field-level foreign keys, semantic relation names, physical SQL/Supabase
mappings, relation-root traversal, relation-enriched entity variants, relation-like graph API
entries, and authorization concepts derived from relationships. Those are related pressures, but
they are not necessarily one abstraction.

This slice exposes only the relation semantics Ontahi already executes: a named `belongsTo` or
`hasMany` edge to another entity. The broader classification remains valuable research, but it is
not a gate for the rest of plan 71.

## Context

The Todo portability example has one entity and therefore did not pressure relations.

BookOps currently expresses relations through patterns such as:

```ts
BookCollaboratorEntity.belongsTo('book', BookEntity);
BookEntity.hasMany('collaborators', BookCollaboratorWithProfileEntity);
```

Physical mappings are declared separately:

```ts
mapRelation(BookWithLabelsEntity, 'labels', {
  type: 'one-to-many',
  from: 'books.id',
  to: 'book_labels.book_id',
});
```

Traversal uses another surface:

```ts
BookLabel.relatedTo(
  Book.where(book => book.slug.eq(bookSlug)),
  {
    through: 'book',
  },
);
```

The graph API also registers shapes such as:

1. `BookWithCollaborators`,
2. `BookCollaborators`,
3. `NotificationDeliveryWithNotification`.

These names currently blur several concepts:

1. a semantic relation,
2. a storage join/mapping,
3. a selection with included related data,
4. a relation used as the root of an operation,
5. a named read model or view,
6. a compatibility alias registered as though it were an entity.

## Research / Evidence

### Primary BookOps Cases

1. `BookCollaborator.belongsTo(Book)`
2. `BookCollaborator.belongsTo(Profile)`
3. `Book.hasMany(BookCollaborator)`
4. `Book.hasMany(BookLabel)`
5. `Book.hasMany(ReadingProgress)`
6. `ContentNode.belongsTo(Book)`
7. `ContentTranslation.belongsTo(Book)`
8. `NotificationDelivery.belongsTo(UserNotification)`
9. `BookCollaborators.invite`
10. Reader `Chapter -> Section -> Subsection -> ContentBlock` trees

Primary files:

1. `web/src/data/graph/schema.ts`
2. `web/src/data/graph/entities.ts`
3. `web/src/data/graph/reader.entities.ts`
4. `web/src/features/domain/sharing/invite/entity.ts`
5. `ontahi/packages/core/src/data-graph/relation-root.ts`
6. `ontahi/packages/core/src/data-graph/definitions.ts`

### Required Classification

For every representative case, record:

1. source and target semantic concepts,
2. relation name and cardinality,
3. ownership or lifecycle meaning,
4. whether navigation is directional or symmetric,
5. whether the relation has independent identity or attributes,
6. whether it is persisted directly or derived,
7. physical mapping requirements,
8. common traversal and aggregate needs,
9. whether behavior or policy belongs to the relation,
10. whether current API registration creates a duplicate entity identity.

## Proposed Form

```ts
const BookLabel = entity({
  name: 'BookLabel',
  fields: {
    id: field.id(),
    bookId: field.id(),
  },
  relations: {
    book: relation.belongsTo(Book),
  },
});
```

The object form is prepared immediately, so existing `mapRelation(...)` declarations continue to
work without moving. When declaration order or a cycle requires deferred target resolution, the
same property accepts a callback:

```ts
relations: () => ({
  collaborators: relation.hasMany(BookCollaborator),
});
```

Deferred callbacks are evaluated by `ontahi()` after all declarations exist and before any entity
is bound to graph commands or operations.

Existing physical mapping and traversal surfaces remain valid:

```ts
mapRelation(BookLabel, 'book', {
  type: 'many-to-one',
  from: 'book_labels.book_id',
  to: 'books.id',
});

BookLabel.relatedTo(
  Book.where(book => book.id.eq(bookId)),
  {
    through: 'book',
  },
);
```

The bridge is intentionally experimental. It should collect migration evidence rather than imply
that the general relationship model is closed.

## Scope

This checkpoint includes:

1. immediate and deferred relation declarations inside unified entities,
2. `belongsTo` and `hasMany`,
3. deferred declaration evaluation,
4. preserving inferred relation targets,
5. binding relations before operations,
6. existing reflection and relation-root traversal.

## Non-Goals

1. Do not implement a generic graph database.
2. Do not redesign the query planner or relation-root traversal.
3. Do not solve relations with attributes or independent identity.
4. Do not assign operations or policies to relations.
5. Do not solve the complete authorization model from plan 78.
6. Do not absorb physical storage mappings into semantic declarations.
7. Do not settle whether enriched results are views, projections, or read models.
8. Do not require the remaining research questions to be answered before BookOps migration.

## Candidate Models

These candidates are starting points, not decisions.

### Candidate A: Relations Inline In Entity Declarations

```ts
const BookCollaborator = entity({
  name: 'BookCollaborator',
  fields: { bookId: field.id(), userId: field.id() },
  relations: () => ({
    book: relation.toOne(Book, {
      from: 'bookId',
      to: 'id',
    }),
    profile: relation.toOne(Profile, {
      from: 'userId',
      to: 'id',
    }),
  }),
});
```

Advantages:

1. compact and discoverable,
2. relation names live beside entity meaning,
3. natural typed traversal.

Risks:

1. physical mapping may leak into semantic declarations,
2. circular initialization,
3. behavior and policy ownership remain unclear.

### Candidate B: Relations As Independent Declarations

```ts
const BookCollaborators = relation({
  name: 'Book.collaborators',
  from: Book,
  to: BookCollaborator,
  cardinality: 'many',
});
```

Advantages:

1. relations can own attributes, policy, operations, and evidence,
2. natural representation for collaboration/membership concepts,
3. physical bindings can remain separate.

Risks:

1. verbose for ordinary foreign-key navigation,
2. could turn every edge into unnecessary ceremony,
3. entity authoring becomes fragmented again.

### Candidate C: Inline Relations With Optional Reification

Ordinary navigation remains inline. A relation can be promoted to an independently named semantic
declaration when it has attributes, behavior, policy, or product meaning.

This hybrid is promising, but the promotion rule must be explicit and reflected.

## Open Model Questions

1. Is `BookCollaborator` an entity, a relation with attributes, or both?
2. Is `BookCollaborators.invite` owned by `Book`, `BookCollaborator`, the relation, or a sharing
   capability?
3. Does `BookWithCollaborators` represent a view over `Book`, a named selection, or an output read
   model?
4. Should a relation specify semantic keys while storage providers own column mappings?
5. How are relations declared across packages without eager circular imports?
6. Can a view include relations while preserving the root entity's identity?
7. How does Explorer distinguish entity, relation, relation instance, view, and read model?
8. How do relation facts feed authorization without coupling traversal to a policy engine?

## Acceptance Checklist

- [x] Unified entities accept immediate and deferred relation declarations.
- [x] `relation.belongsTo(...)` and `relation.hasMany(...)` preserve typed targets.
- [x] `ontahi()` prepares every declaration before binding entity operations.
- [x] Immediate declarations remain compatible with existing `mapRelation(...)` calls.
- [x] Existing relation-root tests continue to pass.
- [x] Application composition tests cover deferred evaluation and reflected relations.
- [x] Exercise the bridge with representative BookOps entities during migration.
- [x] Record any case that cannot be represented without expanding the model.

## BookOps Migration Checkpoint

The first production declarations migrated to the unified relation surface are:

1. `BookCollaborator`,
2. `ReadingProgress`,
3. `BookLabel`,
4. `BookSource`,
5. `ContentTranslation`.

Their existing Supabase mappings, relation-root traversal, graph registrations, and companion
methods remain unchanged. Web typechecking and the server/browser graph runtime tests confirm that
the typed `book` relation survives the new declaration boundary.

`Book` itself was intentionally not pulled into this slice. Its declaration also depends on
`display` and `freshness`, which are entity-anatomy concerns rather than relation concerns. That is
evidence for the next work-session thread, not a reason to enlarge this bridge.

## Verification

The incremental bridge is complete when representative BookOps declarations can move to the
unified API without changing their runtime relation behavior. Cases that require relation identity,
attributes, behavior, policy, or enriched result shapes become evidence for later research rather
than expanding this slice automatically.

## Decisions

1. Relations are the first active child of plan 71, but the complete model is not a migration gate.
2. The first bridge represents only named `belongsTo` and `hasMany` relations.
3. Relation declarations are evaluated before entity binding so declaration order does not force
   eager target resolution.
4. Existing physical mapping and traversal APIs remain separate.
5. Existing BookOps syntax is evidence, not necessarily the final API.
6. Views and read models must not be silently modeled as duplicate entities.
7. A hybrid of inline ordinary relations and reified meaningful relations remains a candidate, not
   a decision.

## Deferred Research

The original larger research remains relevant:

1. relation identity and relations with attributes,
2. ownership and lifecycle,
3. relation-owned operations,
4. relation-derived authorization,
5. views, projections, and read models,
6. physical bindings across resources,
7. circular TypeScript inference ergonomics,
8. Explorer representation of reified relations.

Pull one of these into active work only when BookOps migration or another application supplies a
concrete blocking case.

## Closure / Evolution

This plan closes when representative BookOps entities use the bridge successfully and any
unsupported cases have been recorded as focused follow-up evidence. A complete relationship model
is explicitly not required for closure.

## Closure

- Status: done
- Landed in: commit `6b65db6d`
- Closed on: 2026-07-26
- Effective effort: ~1h focused work
- Follow-up: [71b Unified Entity Capability Lift](bookops://plans/71b-unified-entity-capability-lift)
