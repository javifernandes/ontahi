# Selections

A \concept{Selection} is a value that describes which instances of one Entity belong to a set.
It does not load records or require those records to exist in memory. A runtime interprets it only
when a Query, Command, or Operation consumes it.

## Describe membership

Start a Selection from the Entity:

```ts
const open = TodoItem.selection(todo => todo.completed.eq(false));
const inResearch = TodoItem.selection(todo => todo.list.eq(TodoList.refById('list-research')));
const urgent = TodoItem.selection(todo => todo.priority.in(['high', 'critical']));
const unassigned = TodoItem.selection(todo => todo.assigneeId.isNull());
const stale = TodoItem.selection(todo => todo.createdAt.lt('2026-07-01T00:00:00Z'));
```

Field references expose the predicates supported by the Selection language:

| Predicate                 | Membership test                       |
| ------------------------- | ------------------------------------- |
| `field.eq(value)`         | the field equals one value            |
| `field.in(values)`        | the field belongs to a list of values |
| `field.isNull()`          | the field has no value                |
| `field.lt(value)` / `lte` | the field is below a boundary         |
| `field.gt(value)` / `gte` | the field is above a boundary         |

These methods build a portable expression. None of the examples above has queried storage.

## Compose sets

Selections form a small algebra through `and`, `or`, and `not`:

```ts
const visible = open.and(inResearch);
const needsAttention = urgent.or(stale);
const active = TodoItem.selection(todo => todo.archived.eq(true)).not();

const actionable = visible.and(needsAttention).and(active);
```

An operand may also be written inline when it is used once:

```ts
const recentlyCreatedOpenTodos = open.and(todo => todo.createdAt.gte('2026-08-01T00:00:00Z'));
```

Name a reusable criterion when the name carries application meaning:

```ts
const triageQueue = actionable.named('triage-queue');
const portableAst = triageQueue.toJSON();
```

The serialized form preserves the Entity root and membership expression. That is what lets the
same criterion cross a client/server boundary or become editable by another tool.

When `TodoItem` comes from a configured runtime, the Selection also carries that execution binding
in memory. The binding is deliberately absent from `toJSON()`: the value stays portable even though
the local object knows how this application executes it.

## Declare a named Selection factory

A \concept{Selection Factory} gives reusable membership a name and an input contract. Its output
is a Selection, not rows or a Ref. The current authoring surface is an experimental data-first
helper; declare both how inputs are validated and how they expand:

```ts
import { entity, field, graphSchema, withSelectionFactories } from '@ontahi/core/data-graph';

const Tag = withSelectionFactories(
  entity('Tag', {
    id: field.id(),
    name: field.nonEmptyString({ trim: true }),
    color: field.string(),
  }),
  {
    identity: {
      version: 1,
      input: graphSchema.object({ id: field.id() }),
      scalarInput: 'id',
      template: { kind: 'identity', bindings: { id: 'id' } },
    },
    named: {
      version: 1,
      input: graphSchema.object({ text: field.nonEmptyString({ trim: true }) }),
      scalarInput: 'text',
      template: { kind: 'predicate', fieldName: 'name', operator: 'eq', input: 'text' },
    },
  },
);

const work = Tag.by({ named: { text: 'Work' } });
const sameCriterion = Tag.by({ named: 'Work' }); // explicitly enabled scalar shorthand
const importantWork = work.and(tag => tag.color.eq('#dd6658'));
const knownWork = work.and(Tag.by({ identity: 'tag-work' }));
```

`named` is the factory name; `text` is its input, not a Tag Field. `identity` is also explicitly
declared: no factory names are automatically generated. Names disambiguate factories even when
their input schemas are identical. Each `by` call chooses exactly one named factory; SDK code
composes the resulting Selections with `and` or `or`.

The bounded template forms are canonical identity bindings or scalar predicates (`eq`, `lt`,
`lte`, `gt`, `gte`). Inputs are required scalar Fields, optionally nullable. Nested/optional inputs,
arbitrary callbacks and external resolution are not supported. A factory such as
`Customer.by({ archivedSince: { date } })` can bind `date` to an `archivedAt >= date` predicate;
the date must be explicit input, not a hidden clock read. Pure expansion is deterministic, while
the matching population can still change between executions.

Definition-owned and generated-facade `by` results are unbound. Pass the Selection to a compatible
Operation input or an explicit read runtime; do not assume `by` fetches or attaches execution:

```ts
const query = importantWork.toQuery();
const rows = await Effect.runPromise(runtime.run(query, undefined));
```

Here `runtime` is the host's configured Data Graph runtime. The
[Todo Tag declaration](../../../examples/todo-express/src/todo.ts) and
[Core contract](../../../packages/core/README.md#experimental-named-selection-factories)
provide the complete executable and reflection boundaries.

Graph discovery exposes each factory's strict input schema and Selection output entity, without a
cardinality promise. Codegen preserves portable declarations in typed browser facades. Explorer's
Entity Structure panel shows their schemas and templates; dynamic invocation forms remain separate.
The Console accepts factories plus optional `where` in either dialect, for example
`Tag.by({ named: "Work" }).many()` or `Tag by named "Work" many`. Factory and input completion
use the reflected schema; dialect switching and table modifiers preserve the authored invocation.
Additional Console factories intersect membership: `Tag by named "Work" and by identity "tag-work" many`,
or `Tag.by({ named: "Work" }).by({ identity: "tag-work" }).many()` in the TS-like dialect. In the Core
SDK, compose the resulting Selections with `.and(...)`; chained `.by(...)` belongs to Console syntax.

Factories do not assert uniqueness. The receiving input's `one`/`many` contract controls cardinality;
identity references, existence, and uniqueness of current authorized membership remain distinct.
Consumers can compose constraints without modifying the caller's Selection, then build a Command
without a preliminary read. That capability does not widen the current exact remote Command API.

## Navigate relative to the current Selection

An Entity can declare a parameterless contextual Selection using an existing Relation:

```ts
const Book = entity({
  name: 'Book',
  fields: { id: f.id() },
  relations: { contentNodes: relation.hasMany(ContentNode, { via: 'bookId' }) },
  selections: ({ self }) => ({
    parts: self.contentNodes.where(node => node.type.eq('part')),
  }),
});

const parts = Selection.where(Book, book => book.id.eq('book-42')).parts;
```

Here `ContentNode` declares `bookId` and the finite `type` Field. `parts` selects ContentNodes
reachable from the selected Books; it does not select Books or attach a calculated scalar Field to
each row. If ContentNode also declares `chapters`, `parts.chapters` composes another hop. Named
same-Entity factories (`by`) and contextual navigation compose without loading intermediate records.
Use `self.contentNodes.as(Part)` when the target should retain an explicitly declared variant.

The distinction is the Entity that each step selects:

| Step                           | Current population                                      |
| ------------------------------ | ------------------------------------------------------- |
| `Book.by({ slug: 'my-book' })` | Books matching the declared `slug` factory              |
| `.parts`                       | Related ContentNodes classified or filtered as parts    |
| `.chapters`                    | Related ContentNodes classified or filtered as chapters |

Declare each factory on its owning Entity; these names are not built-in fields. A contextual
property is navigation from a Selection, not a materialized collection on a loaded object or a
scalar Derived Field. Likewise, a same-Entity `archived` factory selects Books; it does not change
the root to their content. Both forms build membership and compose without intermediate reads.

In the Console, source and destination filters can be interleaved:

```text
TodoList.where(name = "Later").openItems.where(title = "Review").many()
TodoList where name = "Later" through openItems where title = "Review" many
```

The first predicate is about TodoLists; the second is about TodoItems. No `.one()` is needed before
the hop. Put the read terminal and its sort/limit on the final population. This yields a flat set
of matching TodoItems, not a nested TodoList result; use Query includes/Views for nested output.

The portable membership node is `relation-image`. Several source instances produce one set of
target instances, not grouped results. Apply ordering, limit and View shaping after navigation;
source read shaping is rejected rather than silently discarded. Source `one` cardinality is not a
promise about the destination. Ordinary runtime-bound Selections preserve their binding across
ordinary hops; classified hops have the separate read-only binding described in Core's variant
contract. Definition-owned Selections remain unbound.

In-memory, PostgreSQL, MySQL and Supabase runtimes support contextual reads within their documented
provider limits. SQL uses correlated `EXISTS`; Supabase uses PostgREST relationship embeddings and
existence filters, requiring matching physical FKs. Neither prefetches IDs on the client.
Remote reads negotiate Graph Read v2 and require explicit `selectionRelations` grants plus policy
scopes for every source and the final target. Protocol v1, contextual Commands and contextual
observation remain unsupported; there is no permissive fallback.

See [declarations and protocol](../../../packages/core/README.md#experimental-contextual-selection-factories)
and the [Supabase physical requirements](../../../packages/supabase/README.md#contextual-selection-reads).
The executable [Chapter rehearsal](../../../packages/core/src/runtime/server/bookops-chapter-rehearsal.test.ts)
composes named factories, classified destinations and existing participants.

## Exact-one membership is not a row limit

An exact-one consumer requires exactly one member of the Selection **after authorization scope is
applied, but before read shaping**. Zero or multiple authorized members fail with a cardinality
mismatch. Ordering, projection, and a positive limit cannot turn a non-unique Selection into a
unique one; the same rule applies to counts. `one` with `limit(0)` is contradictory and rejected.

Use nullable `first` when you deliberately want the first matching row, or `exists` when you only
need to know whether there is a match. Neither asserts uniqueness. The Console keeps its stricter
authoring rule: explicit limits are not accepted with `one`; implicit policy limits still cannot
hide duplicate membership.

SQL adapters check up to two authorized rows in one statement. Supabase requests exact count
metadata together with the rows, because a server row cap can otherwise hide additional matches.
These are read checks, not persistent uniqueness guarantees or read-before-write mutation steps.

## Identities can describe membership too

An operation input declared as `self.many()` accepts a predicate-defined Selection, explicit
identities, or materialized records:

```ts
await TodoItem.complete({ todos: triageQueue });
await TodoItem.complete({ todos: ['todo-23', 'todo-42'] });
await TodoItem.complete({ todos: checkedTodoRecords });
```

Ontahí normalizes each form into the same semantic target. The operation does not need
`completeById`, `completeSelected`, and `completeByFilter` variants.

## One Selection, different interpretations

A bound Selection can observe the set directly or add read shape first:

```ts
const nextTen = triageQueue.orderBy(todo => todo.createdAt).limit(10);

const rows = nextTen.run();
```

A Command can change exactly the same set through the same binding:

```ts
const result = triageQueue.update({ completed: true }).run();
```

The Selection remains membership. `orderBy` and `limit` add read shape; `update` chooses a write
interpretation; `run` asks the bound runtime to interpret the resulting program. The next two
chapters describe those operator surfaces directly.

## The UI can author the same value

A filter model can construct the Selection used by both a read and an operation:

```tsx
const visibleTodos = useMemo(() => {
  const inList = TodoItem.selection(todo => todo.list.eq(TodoList.refById(listId)));
  return status === 'all' ? inList : inList.and(todo => todo.completed.eq(status === 'completed'));
}, [listId, status]);

const todos = useGraphQuery(TodoItem.all().where(visibleTodos).as(TodoItemRow));
const complete = useOperation(TodoItem.domain.complete({ todos: visibleTodos }));

await complete.executeAsync();
```

The UI does not translate its filter into a separate request model. It authors the same
Selection language used by Node, the remote Query dispatcher, and the Operation runtime.
