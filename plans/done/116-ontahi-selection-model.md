# 116. Ontahí Selection Model

Status: done

Canonical ID: `ontahi://plans/116-ontahi-selection-model`

Migrated from: `bookops://plans/116-ontahi-selection-model`
Original path: `plans/done/116-ontahi-selection-model.md`
Source commit: `67713696`

Related plans:

1. [53 Selection-Centric Data Language](bookops://plans/53-entity-targets-and-mutations)
2. [74 Entity Refs And Unit Of Work](bookops://plans/74-entity-refs-and-unit-of-work)
3. [79 Graph-Native Schema DSL](bookops://plans/79-graph-native-schema-dsl)
4. [118 Ontahí Selection Language Editor Research](bookops://plans/118-ontahi-selection-language-editor)
5. [119 Relation Predicates In Selection](bookops://plans/119-selection-relation-predicates)
6. [120 Named And Saved Selections](bookops://plans/120-named-and-saved-selections)

## Summary

Define `Selection` in Atlas as the Ontahí model for describing a set of entities, either by extension or by comprehension.

Plan 53 introduced a selection-centric graph API. Refs, queries, commands, and domain operations have since created a broader modeling pressure: Ontahí needs one language for saying which entities a capability reads, targets, authorizes, changes, or presents. This plan names that language and separates it from the consumers that use it.

Because a selection is data rather than only an executable closure, it can also become a reflective and user-authored object. Named and saved selections, relation predicates, statistics, widgets, and dashboards remain explicit follow-ups rather than completion requirements here.

The result is a shared model, vocabulary, serializable AST, operation-schema contract, provider lowering, cardinality enforcement, and a first Explorer projection.

## Context

An operation that receives an id forces its implementation to reconstruct a selection:

```ts
deleteBooks({ id: bookId });
```

The domain intent is clearer when the operation receives the criterion directly:

```ts
deleteBooks(book => book.id.eq(bookId));

deleteBooks(book => book.createdAt.lt(sixMonthsAgo));
```

Both inputs describe subsets of `Book`. A ref can describe a singleton by extension; a predicate can describe a subset by comprehension. Queries and operations should be able to consume this common meaning without becoming the same concept.

The same distinction appears in Explorer. A table filter should not create a UI-only filtering language. It should edit a Selection whose resolved members are displayed in the table and may later feed a count, aggregate widget, saved view, or operation.

## Model Hierarchy

Atlas uses this hierarchy:

```text
Entity<T>                         universe of discourse
└── Selection<T>                 subset of T
    ├── ExtensionalSelection<T>  references are enumerated
    ├── IntensionalSelection<T>  membership is described by a predicate
    └── composed Selection<T>    and / or / not over either form

Ref<T>                           stable pointer to one T
Query<T>                         Selection<T> + read shape/execution
Operation<T>                     behavior whose target may be a Selection<T>
```

`Ref` is related to `Selection` but should not automatically become its subtype. A ref identifies an entity; a selection denotes a set. A singleton selection may be constructed from a ref.

`Query` is also not a synonym for `Selection`. Projection, includes, ordering, pagination, and materialization belong to reading a selection, not necessarily to describing an operation target.

Named domain selections and persisted user-owned selections are compatible future consumers of the same AST, but their identity, parameters, versioning, ownership, and persistence are deferred to plan 120.

## Selection Algebra

The smallest closed algebra shared by reads and operation targets is:

1. `all` and `none`,
2. singleton or explicit members by extension,
3. scalar field predicates (`eq`, `in`, `isNull`, `lt`, `lte`, `gt`, and `gte`) by comprehension,
4. recursive `and`, `or`, and `not` composition.

Reference selections preserve extension explicitly in the canonical AST:

```ts
Selection.references(Book, [Book.refById('book-1'), Book.refById('book-2')]);
```

```ts
{
  kind: 'references',
  refs: [
    { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
    { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-2' } },
  ],
}
```

Providers lower `references` through locator fields during planning. The AST retains refs so reflective editors can reconstruct the selected entities without reverse-engineering optimized predicates.

1. union / `or`,
2. intersection / `and`,
3. complement / `not`.

Relation predicates such as `some`, `every`, and `none` are deferred to plan 119.

The model should distinguish set operations from query-only transformations. `select`, `include`, `orderBy`, and pagination do not change membership in the same sense and should remain outside the base algebra unless research shows otherwise.

## Intended Authoring Shape

Anonymous selection by comprehension:

```ts
deleteBooks(book => book.id.eq(bookId));
```

Named selection with domain meaning:

```ts
const abandonedDrafts = Book.selection('abandonedDrafts', book =>
  book.status.eq('draft').and(book.lastEditedAt.lt(sixMonthsAgo)),
);

archiveBooks(abandonedDrafts);
```

Selection by extension:

```ts
deleteBooks(Selection.references(Book, [firstBookRef, secondBookRef]));
```

`references` is the settled vocabulary for selection by extension. Locators remain the vocabulary for the identity mechanism inside each ref.

## Closed Design Decisions

### Identity And Membership

1. Extensional selections contain serializable entity refs, not hydrated entity values.
2. Providers lower locator-backed refs to field predicates while the canonical AST preserves `references`.
3. A ref identifies one entity; a selection denotes a set. Neither inherits from the other.

### Cardinality

1. Cardinality is a consumer requirement carried by a rehydrated selection, not an intrinsic claim made by its expression.
2. `one` means exactly one resolved member. Both zero and more than one are failures. `many` means zero or more and is the default.
3. Validation is two-stage: reject structurally knowable mismatches (`none`, or a `references` count other than one) at input parsing; validate data-dependent expressions after provider materialization.
4. Composition preserves `one`, and downstream query/command helpers may strengthen `many` to `one` but cannot weaken `one` to `many`.
5. Reads, counts, updates, and deletes enforce the requirement. In-memory mutations validate before publishing changed state; external providers own the atomic/concurrent enforcement guarantees they advertise.

### Evaluation Time

1. A selection expression remains distinct from its resolved members.
2. Ordinary operations evaluate it when the consuming read or command executes.
3. Selection does not imply a snapshot. Durable work that needs stable membership must explicitly capture references as durable execution policy; otherwise it re-evaluates when consumed.

### Validation And Authority

1. Selection construction validates entity, fields, operators, and structural compatibility.
2. Operation invocation validates accepted entity type, selection form, and cardinality contract.
3. Authority evaluates whether the actor may act on the selected set, including partial-match behavior.
4. Execution owns concurrency, bulk limits, stale membership, and adapter failures.

### Representation

1. The canonical form is the smaller Selection AST, consumed by queries and commands and compiled by providers.
2. Require a pure, serializable representation where selections cross transport or durable boundaries.
3. Keep anonymous functions as authoring syntax only if they lower deterministically into the canonical form.
4. Make TypeScript builders, a future textual language, and a projectional React editor lossless projections over the same AST.

### Reflective And Product Surfaces

1. Reflected descriptors expose the entity, cardinality, identity locator, and canonical AST transport shape.
2. Explorer operation inputs project `none`, `all`, and `references` with single/multiple interaction from reflected cardinality.
3. Rich Data filters, saved selections, statistics, widgets, dashboards, and previews are consumers to design in follow-ups.

## Scope

In scope:

1. the `ontahi.model.selection` Atlas item,
2. extension and comprehension as first-class construction forms,
3. hierarchy and boundaries among entity, selection, ref, query, and operation,
4. the minimal membership algebra,
5. cardinality, validation, authority, and evaluation-time semantics,
6. the reflected representation needed by future Explorer surfaces,
7. reconciliation with the Selection APIs already present in `@ontahi/core`,
8. exact-one validation semantics and provider enforcement.

Out of scope:

1. implementing every future Selection operator or product surface,
2. migrating existing operations,
3. treating every query feature as valid for mutation targets,
4. choosing database-adapter optimizations,
5. removing refs or named selections,
6. implementing relation predicates, named/saved selection persistence, the language editor, widget runtime, or dashboard builder in this plan.

## Execution Slices

### Slice 1: Inventory Existing Meanings

- [x] Map current `GraphSelection`, query predicates, command targets, entity refs, and operation ref inputs.
- [x] Record where the same selection meaning currently has different representations.
- [x] Separate established behavior from accidental API naming.

### Slice 2: Decide The Model

- [x] Settle the hierarchy and whether `Ref` composes with rather than inherits from `Selection`.
- [x] Define extension through `references`, comprehension through predicates, and recursive composition.
- [x] Define the boundary between membership algebra and read shaping.
- [x] Decide where cardinality and evaluation-time guarantees live.
- [x] Separate snapshots from expressions and extract named/saved selection lifecycle as plan 120.

### Slice 3: Write The Atlas Item

- [x] Add the initial `ontahi.model.selection` item below `ontahi.model`.
- [x] Link the initial item to `Entity`, `Ref`, `Domain Operation`, Explorer, and the graph language.
- [x] Include the canonical vocabulary, hierarchy, algebra, examples, invariants, and closed decisions.
- [x] Update neighboring Atlas items where they currently use `selection`, `query`, `target`, or `ref` ambiguously.

### Slice 4: Reconcile Implementation Direction

- [x] Compare the model with the existing query and selection specs in `@ontahi/core`.
- [x] Identify the smallest follow-up needed to align names or extract a canonical selection representation.
- [x] Surface reflected selections in Explorer with entity/cardinality semantics and safe `none` / `all` authoring.
- [x] Preserve reference-defined extension in the Selection AST and lower locators during execution planning.
- [x] Let Explorer resolve the reflected identity locator and author one/many reference selections from entity data.
- [x] Extract later plans for the language editor, relation predicates, named/saved selections, and Alive UI.
- [x] Implement exact-one propagation and validation in the in-memory and Supabase providers.

## Verification

- [x] Atlas explains a selection without referring to a particular database or runtime.
- [x] The same membership expression can serve a read and an operation target.
- [x] `Ref`, `Selection`, `Query`, and `Operation` have non-overlapping definitions.
- [x] Extension and comprehension produce equivalent singleton meaning where appropriate.
- [x] Query-only transformations are visibly outside the base selection algebra.
- [x] Validation and evaluation responsibilities are assigned to explicit layers.
- [x] Cardinality is enforced structurally where knowable and at materialization otherwise.
- [x] Deferred surfaces are explained as consumers of one Selection AST and tracked separately.

## Completion

This plan is complete when Atlas contains a coherent `Selection` model, neighboring concepts use its vocabulary consistently, and any implementation gap has been extracted into a concrete follow-up plan.

Completed on 2026-07-22. The remaining language-editor, relation-predicate, saved-selection, and Alive UI work is tracked independently and is not required to reopen this model decision.

Evolution checkpoint 2026-08-12: the public Selection remains the portable membership value, while
a Selection authored from a bound Entity now retains its runtime. Read shaping promotes it to a
bound Query and mutation shortcuts produce bound Commands; `toJSON()` still emits only the
provider-neutral Selection AST. Operation inputs restore that runtime binding on the authoritative
side. Remote Query/Command transport continues separately in plan 128 and does not change the
Selection model.
