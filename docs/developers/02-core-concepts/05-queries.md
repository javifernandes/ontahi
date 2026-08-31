# Queries

A \concept{Query} describes what to read from an Entity set. A Selection contributes membership;
the Query adds result shape, relations, order, and bounds. Building one does not execute it.

## Choose the set

Start from every instance when the read itself is the only value being authored:

```ts
const allTodos = TodoItem.all();
```

Start from a Selection when membership has its own meaning or may be reused:

```ts
const openTodos = TodoItem.selection(todo => todo.completed.eq(false));
```

That Selection is already a valid Query starting point:

```ts
const visibleTodos = TodoItem.selection(todo =>
  todo.list.eq(TodoList.refById('list-research')),
).and(todo => todo.completed.eq(false));

const query = visibleTodos.orderBy(todo => todo.title);
```

`TodoItem.where(...)` remains a query-only shortcut. Once a Query exists, `where` can keep
narrowing it; each call combines with the existing membership:

```ts
const urgentOpenTodos = TodoItem.where(todo => todo.completed.eq(false)).where(todo =>
  todo.priority.in(['high', 'critical']),
);
```

## Project the result

Without `select`, a Query returns the complete Entity shape. `select` declares an exact result:

```ts
const todoSummaries = TodoItem.all().select(todo => ({
  id: todo.id,
  title: todo.title,
  completed: todo.completed,
}));
```

Selections may be nested into semantic groups without changing the Entity:

```ts
const rows = TodoItem.all().select(todo => ({
  identity: { id: todo.id },
  content: { title: todo.title, completed: todo.completed },
}));
```

The inferred TypeScript result follows the projected shape.

## Reuse a result view

A \concept{View} names a reusable result shape. Use it when several callers need the same fields
and Relation traversal:

```ts
const TodoListRow = TodoItem.view('TodoListRow', {
  id: true,
  title: true,
  list: {
    id: true,
    name: true,
  },
});

const rows = await openTodos.as(TodoListRow).run();
```

`true` keeps the field's ordinary value. For a Reference Field, that ordinary value is still a
Ref. A nested object traverses the declared Relation and materializes the related Entity:

```ts
const TodoRefs = TodoItem.view('TodoRefs', {
  id: true,
  list: true, // EntityRef<'TodoList'>
});

const TodoWithListName = TodoItem.view('TodoWithListName', {
  id: true,
  list: { name: true }, // { name: string }
});
```

The shape is finite and explicit even when the Entity graph contains cycles. Ontahí never follows
Relations recursively unless the View asks it to. The same View can shape a Query, a Selection, or
a Selection returned by an Operation.

## Include related Entities

Views are the preferred reusable result-shaping API. `select` and `include` are the lower-level
Query surface: use them for one-off shapes or when a caller needs relation-specific ordering,
limits, or other controls that are not part of a View.

Declared Relations are available from the Query proxy:

```ts
const todosWithList = TodoItem.all().include(todo => ({
  list: todo.list.select(list => ({
    id: list.id,
    name: list.name,
  })),
}));
```

Relation reads have their own shape operators:

```ts
const todosWithRecentAssignments = TodoItem.all().include(todo => ({
  tagAssignments: todo.tagAssignments.orderBy(assignment => assignment.tagId).limit(5),
}));
```

A required Reference Field produces one related value; a nullable Reference Field produces one
value or `null`. `hasMany` produces an array. The Relation declaration carries that cardinality
into the Query result.

## Order and bound

A bare field orders ascending. Call `asc()` or `desc()` when the direction should be explicit:

```ts
const page = TodoItem.where(todo => todo.completed.eq(false))
  .orderBy(todo => todo.priority.desc())
  .orderBy(todo => todo.title.asc())
  .limit(50);
```

Order calls compose in declaration order. `limit` bounds the materialized result without changing
membership.

Name a reusable read without duplicating its shape:

```ts
const openTodoTitles = TodoItem.where(todo => todo.completed.eq(false))
  .select(todo => ({ id: todo.id, title: todo.title }))
  .orderBy(todo => todo.title)
  .named('open-todo-titles');
```

## Choose an execution

A Query bound to an application runtime exposes several interpretations:

| Method     | Result                            |
| ---------- | --------------------------------- |
| `run()`    | every matching result as an array |
| `get()`    | one matching result or `null`     |
| `count()`  | the number of matching Entities   |
| `exists()` | whether at least one match exists |
| `stream()` | a stream of matching results      |

```ts
const first = openTodos.orderBy(todo => todo.title).get();
const total = openTodos.count();
const anyUrgent = urgentOpenTodos.exists();
const stream = todoSummaries.stream();
```

`openTodos` is still the same Selection value; its runtime binding makes the read interpretations
available without rebuilding it through `TodoItem.where(openTodos)`. Shaping methods preserve that
binding.

These methods produce runtime computations. An operation may return a Query directly when it only
needs the final result:

```ts
list: operation({
  input: self.many(),
  output: self.array(),
  run: todos => todos.orderBy(todo => todo.title).limit(100),
}),
```

A more complex operation can execute an intermediate Query and continue composing work. The
runtime remains responsible for interpreting the same Query language against its storage.

## Execute a Query from a headless host

Code at the server-application boundary can execute the same Query without manually opening a
server Effect scope or installing a storage concern:

```ts
const item = await application.graph.read(
  query(AtlasItem)
    .where(item => item.id.eq(itemId))
    .one(),
  { scope: 'atlas.item-context' },
);
```

`application.graph.read(...)` is bound to that exact application and returns a Promise. A plain
Query or View returns every match. The Query terminal communicates the other interpretations:

```ts
const first = await application.graph.read(items.first()); // Item | null
const one = await application.graph.read(items.one()); // Item, strict cardinality
const count = await application.graph.read(items.count()); // number
const exists = await application.graph.read(items.exists()); // boolean
```

Pass View parameters and provider-specific read options together when needed:

```ts
const rows = await application.graph.read(itemsByStatus, {
  params: { status: 'open' },
  runtimeOptions,
});
```

The application boundary supplies runtime context, telemetry, and the configured storage for that
application. Inside an Operation, keep using its runtime-bound Query methods and Effects: the
Operation already owns a scope, UnitOfWork, authorization context, and possibly a transaction.

## Observe a Query from React

Generated client Entities expose the same `all()` and `where(...)` entry points. React derives the
ordinary execution mode and cache key from the Query itself:

```tsx
const TodoRow = TodoItem.view('TodoRow', {
  id: true,
  title: true,
  completed: true,
});

const openTodoRows = TodoItem.where(todo => todo.completed.eq(false))
  .as(TodoRow)
  .orderBy(todo => todo.title);

const rows = useGraphQuery(openTodoRows);
const first = useGraphQuery(openTodoRows.first());
const one = useGraphQuery(openTodoRows.one());
const total = useGraphQuery(openTodoRows.count());
const any = useGraphQuery(openTodoRows.exists());
```

Many rows are the default. `first()` permits no match; `one()` asserts strict cardinality. The
canonical cache key includes the Entity, Selection, View, ordering, limit, cardinality, and read
intention, then partitions that program by the provider's `ExecutionIdentity`.

The same Query may execute directly against a browser-safe adapter or cross the remote graph-read
protocol. A server-backed browser can only use the Entity fields, operators, Relations, modes, and
row scope allowed by an explicit server policy. Entity registration alone exposes nothing.
