---
id: ontahi.model.selection
kind: concept
title: Selection
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.domain-topology-graphos
  - ontahi.operation-contracts
  - ontahi.source-code-organization.explorer-react
relatedPlans:
  - bookops://plans/53-entity-targets-and-mutations
  - bookops://plans/74-entity-refs-and-unit-of-work
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/121-ontahi-direct-postgres-adapter
  - bookops://plans/118-ontahi-selection-language-editor
  - bookops://plans/119-selection-relation-predicates
  - bookops://plans/120-named-and-saved-selections
  - bookops://plans/122-ontahi-developer-book
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
migratedFrom: bookops://atlas/model/selection
sourceCommit: 67713696
---

A [[ontahi.model.selection|Selection]] describes a set of [[ontahi.model.entity|Entities]]. It is the common membership language used to say which entities a read observes, an operation targets, a policy permits, or a reflective surface presents.

A selection can be defined:

1. **by extension**, by enumerating members or stable [[ontahi.model.ref|Refs]], or
2. **by comprehension**, by declaring the predicate that members satisfy.

```ts
Selection.references(Book, [firstBookRef, secondBookRef]);

Book.selection(book => book.createdAt.lt(sixMonthsAgo));
```

Both forms lower to a pure selection representation. The authoring syntax is not the canonical model: a serializable Selection AST preserves entity identity, fields, operators, values, relations, and composition independently from TypeScript, a database, or a particular runtime.

Extension is represented by a `references` expression whose refs use the entity's declared locators:

```ts
const selectedBooks = Selection.references(Book, [
  Book.refById('book-1'),
  Book.refBySlug('programming'),
]);
```

```ts
{
  kind: 'references',
  refs: [
    { kind: 'entity-ref', entityName: 'Book', locator: { id: 'book-1' } },
    { kind: 'entity-ref', entityName: 'Book', locator: { slug: 'programming' } },
  ],
}
```

`references` records how members were identified; it is not a second execution algebra. Planning lowers each locator to its corresponding field predicates, combines composite locators with `and`, and combines refs with `or`. Keeping refs in the canonical AST preserves enough intention for Explorer, saved selections, and other reflective consumers to reconstruct the chosen entities.

The public membership value is `Selection<TEntity>`. Its base algebra is `all`, `none`, `references`, scalar field predicates (`eq`, `in`, `isNull`, `lt`, `lte`, `gt`, and `gte`), and recursive `and`, `or`, and `not`. It remains a portable value, but exposes fluent projection shortcuts: read shaping such as `orderBy`, `select`, `include`, and `limit` promotes it to a `GraphSelection`, while `update`, `updateReturning`, `delete`, and `deleteReturning` produce Commands. When the Entity is bound to a runtime, the Selection and every promoted read or Command preserve that execution binding; `toJSON()` still emits only the portable Selection AST. These methods preserve the original membership expression without binding its meaning to a storage provider. Relation predicates are a compatible extension tracked separately rather than part of the established base.

The Boolean algebra keeps the primitive predicate vocabulary small. Inequality is `not(eq)`, exclusion is `not(in)`, non-null is `not(isNull)`, and a bounded interval composes `gte` with `lte`. Text, array, JSON, and full-text operators require type- and provider-specific semantics and are not implied by the scalar core.

```ts
const abandonedDrafts = Book.selection(book => book.status.eq('draft'))
  .and(book => book.lastEditedAt.lt(sixMonthsAgo))
  .named('abandonedDrafts');
```

`Entity.selection(...)` is the ordinary authoring form on a bound server entity and on its
generated browser projection. Both produce the same transport-safe `Selection<TEntity>`; the
top-level `selection(entity, ...)` factory remains the lower-level schema-oriented form.

## Operation Contracts

Operation authors declare entity targets through the entity itself:

```ts
const DeleteBooksInput = value('DeleteBooksInput', {
  books: Book.many(),
});
```

Inside an entity declaration the same contract reads `self.many()`. The operation handler receives
the semantic target set, while client callers can pass that full value or use the entity's default
identity to provide explicit members ergonomically:

```ts
await deleteBooks.executeAsync({ books: selectedBookIds });
await deleteBooks.executeAsync({ books: selectedBookRecords });
```

For a single-field identity, scalar values become refs. Entity records are projected to their
default identity; the records themselves are not transported. Composite identities require records
containing the identity fields. Across an invocation boundary, Ontahí still transports only
`{ kind: 'selection', entityName, expression }`. Input validation checks the entity, AST structure,
fields, operators, and values before reconstructing the server-side Selection. Cardinality is
intentionally absent from that payload: the consuming operation input schema supplies `one` or
`many`, and server validation attaches that requirement to the rehydrated Selection.

`Book.one()` and `Book.many()` are the primary operation-contract API. They intentionally keep the
Selection schema machinery out of ordinary declarations; `graphSchema.selection(...)` remains the
lower-level equivalent. `Selection.references` remains useful when callers need non-default
locators or already hold refs, while `Selection.where` and Boolean composition express
predicate-defined membership.

Cardinality and materialization are different meanings. `Book.many()` describes a set that may be
resolved later. `Book.array()` describes an output containing already-materialized Book snapshots.

Selection cardinality is a requirement of the consumer rather than an intrinsic property of the set expression. `one` means that evaluation must resolve exactly one member; `many` means zero or more members and is the default.

```ts
const RenameBookInput = value('RenameBookInput', {
  book: Book.one(),
});
```

The reflected schema exposes this requirement so Explorer can choose a single-selection or set-selection editor. Validation occurs at two layers:

1. schema parsing rejects a statically knowable mismatch, such as `none` or a `references` expression containing zero or multiple refs for a `one` input;
2. the runtime consumer validates predicates, `all`, and composed expressions against the materialized result.

The rehydrated Selection carries the requirement into queries and commands. Composition preserves `one`; an API may strengthen a requirement to `one`, but a bulk helper cannot weaken an existing `one` to `many`. Reads and counts fail unless exactly one member resolves. Updates and deletes do the same, with the execution provider responsible for ensuring failed cardinality checks do not expose partial effects and for documenting its concurrency guarantees.

Operation implementations therefore use the semantic input directly in the common case:

```ts
rename: operation({
  input: O.object({
    book: self.one(),
    title: self.fields.title,
  }),
  output: self,
  run: ({ book, title }) => book.updateReturning({ title }, ['id', 'title']),
});
```

The selection contract already says `one`, so mutation names do not repeat `updateOne` or
`deleteOne`. `commands.where(selection)` remains the lower-level binding form for implementations
that must execute intermediate graph work before returning their final result.

## Algebra

Selections should form a small closed algebra of membership:

1. universal and empty selections,
2. singleton and explicit-member selections,
3. field predicates,
4. union, intersection, and difference,
5. recursive compositions over another selection.

Projection, includes, ordering, pagination, grouping, and aggregation consume or shape a selection but are not themselves part of its membership algebra.

## Related Concepts

A `Ref` identifies one stable entity. It can construct a singleton selection, but identity and set membership remain distinct meanings.

A query adds read shape and execution to a selection. A Command adds a state transition over the same membership. The bound runtime decides whether either program executes directly through a storage adapter or crosses a [[ontahi.data-graph-execution-routing|Data Graph Execution Routing]] boundary. A domain operation may accept a selection as its target and add behavior, validation, authority, and effects. Cardinality requirements belong primarily to the consumer, while the number of matching entities is a fact of evaluating the selection.

The consequence is that one operation can support multiple use cases without multiplying its API surface:

```ts
markNotificationsRead({
  notifications: UserNotification.selection(notification => notification.id.eq(id)),
});

markNotificationsRead({
  notifications: UserNotification.selection(notification => notification.kind.eq('mention')),
});

markNotificationsRead({
  notifications: Selection.all(UserNotification),
});
```

The operation owns the behavior and authority rules; callers own the target set. For example, the server can intersect every incoming notification selection with the authenticated user's notifications and with `isRead = false`. Fixed convenience operations may remain as named façades over the same selection-based implementation.

## Future Named And Saved Selections

A named selection could give reusable domain meaning to a criterion declared in code. A saved selection could persist a user-authored Selection AST for later reuse. They share the same algebra but differ in ownership and lifecycle; their identity, parameters, versioning, persistence, and authority remain backlog work rather than established Selection semantics.

Saved selections make filters first-class rather than incidental UI state. Ontahi Explorer can project the same AST as:

1. table filters in an entity Data view,
2. a textual or structured query representation,
3. a projectional React editor,
4. the population behind a statistic or dashboard widget,
5. a previewable target for an operation.

The Selection AST is the source of truth across these projections. A table, widget, dashboard, or editor is a consumer or editor of the selection, not a second selection language.

The future Selection language editor is a distinct artifact rather than a React component owned by Explorer. It may use textual, structural, or hybrid interaction and may keep recoverable document state while a user types, but persisted and transported meaning remains the canonical Selection AST. Explorer should embed the editor through an adapter.

Explorer's operation-input projection recognizes reflected selection fields by entity, cardinality, and identity locator. It presents the mutually exclusive scopes `None`, `Selected (n)`, and `All`, defaults bulk selections to `None`, and loads reflected entity data for editing the references behind `Selected`. Single-cardinality inputs use radio semantics and omit `All`; many-cardinality inputs use checkbox semantics. The raw JSON inspector remains available for composed expressions. Predicate and set-composition controls can extend this projection without changing the transported Selection AST.

## Evaluation And Snapshots

A selection expression is not its resolved members. Ordinary operations evaluate it when the consuming read or command executes. Authority, bulk limits, stale membership, concurrency, and adapter failures belong to invocation and execution layers rather than the AST.

Selection does not silently snapshot its population. Durable work that requires stable membership must explicitly capture resolved refs as part of its durable execution policy; otherwise the selection is re-evaluated when a later step consumes it. Saving an expression and snapshotting its current members are therefore different operations.
