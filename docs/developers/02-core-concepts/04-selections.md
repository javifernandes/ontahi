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

## Experimental parameterized factories

The data-first `withSelectionFactories` Core helper adds a typed `by({ name: inputs })` surface
alongside existing locators. A declared factory expands explicit inputs into an ordinary Selection,
without reading records. For example, `Customer.by({ archivedSince: { date } })` can bind a `date`
input to an `archivedAt >= date` predicate even though `date` is not an Entity Field.

The initial declaration, reflection, and compatibility contract is documented in the
[Core factory example](../../../packages/core/README.md#experimental-named-selection-factories).
It supports pure scalar-predicate and canonical-identity templates, not arbitrary callbacks or
external resolution. Automatic runtime binding remains a follow-up.
`by` returns an unbound Selection that can cross an Operation input
boundary or be consumed by an explicit runtime.

Graph discovery exposes each factory's strict input schema and Selection output entity, without a
cardinality promise. Codegen preserves portable declarations in typed browser facades. Explorer's
Entity Structure panel shows their schemas and templates; dynamic invocation forms remain separate.
The Console accepts one factory plus optional `where` in either dialect, for example
`Tag.by({ named: "Work" }).many()` or `Tag by named "Work" many`. Factory and input completion
use the reflected schema; dialect switching and table modifiers preserve the authored invocation.

Factories do not assert uniqueness. The receiving input's `one`/`many` contract controls cardinality;
identity references, existence, and uniqueness of current authorized membership remain distinct.
Consumers can compose constraints without modifying the caller's Selection, then build a Command
without a preliminary read. That capability does not widen the current exact remote Command API.

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
