# Commands

A \concept{Command} describes a storage-neutral change. It names the target Entity, the
Selection being changed, the payload, expected cardinality, and any fields to return. Building a
Command does not mutate storage; calling `run()` asks a configured runtime to interpret it.

## Insert from the Entity

Creation begins at the Entity root:

```ts
const research = TodoList.refById('list-research');

const createTodo = TodoItem.insert({
  id: 'todo-42',
  list: research,
  title: 'Read the runtime notes',
  completed: false,
});

const creation = createTodo.run();
```

Ask for the fields needed by the next step without materializing an unspecified record shape:

```ts
const createAndReturnIdentity = TodoItem.insertReturning(
  {
    id: 'todo-42',
    list: research,
    title: 'Read the runtime notes',
    completed: false,
  },
  ['id', 'title'],
);
```

The result type is exactly `{ id: string; title: string }`.

## Insert many

The plural form keeps one Command and one declared result shape:

```ts
const importTodos = TodoItem.insertManyReturning(
  [
    { id: 'todo-43', list: research, title: 'Map the query API', completed: false },
    { id: 'todo-44', list: research, title: 'Map the command API', completed: false },
  ],
  ['id'],
);
```

`insert` and `insertMany` omit a return value. Their `Returning` variants return one projected
record or an array with the same cardinality as the insertion.

## Author an exact Entity lifecycle command

Generated client Entity facades expose a smaller lifecycle vocabulary for one exact Entity
instance:

```ts
const enrollment = Enrollment.create({
  id: 'enrollment-42',
  student: Student.refById('student-1'),
  course: Course.refById('course-1'),
  status: 'active',
});

const endEnrollment = Enrollment.refById('enrollment-42').update({ status: 'ended' });
const removeEnrollment = Enrollment.refById('enrollment-42').delete();
```

`create` requires every required stored Field, including canonical participant Refs. `update`
accepts only stored Fields from the referenced Entity, and `delete` already knows its exact target
from the Ref. Derived Fields are never mutation inputs.

These methods author the canonical portable Entity Mutation Command; they do not put mutable state
or a runtime inside the Entity or Ref. A facade bound to a Data Graph runtime adds a non-enumerable
`run()` method to the authored Command:

```ts
yield * BoundEnrollment.create(values).run();
yield * BoundEnrollment.refById('enrollment-42').delete().run();
```

Generated browser code can instead pass the same portable value to the graph executor. The server
executes it only when an Entity Mutation Command policy explicitly permits the Entity, action,
fields, result shape, and row scope. `mutateEntity(Entity)` remains the lower-level constructor for
framework integrations and code that does not use a generated client facade.

## Upsert with an explicit conflict rule

```ts
const synchronizeTodo = TodoItem.upsert(
  {
    id: external.id,
    list: TodoList.refById(external.listId),
    title: external.title,
    completed: external.done,
  },
  { conflictOn: ['id'], strategy: 'merge' },
);
```

`strategy: 'merge'` updates the conflicting record; `strategy: 'ignore'` preserves it. The
plural `upsertMany` form applies the same declared rule to a payload array.

## Update a Selection

A Selection already carries the target set:

```ts
const overdue = TodoItem.selection(todo => todo.dueAt.lt('2026-08-01T00:00:00Z'));

const completeOverdue = overdue.update({ completed: true });
const completion = completeOverdue.run();
```

Return only the changed fields when they matter:

```ts
const completeAndReturn = overdue.updateReturning({ completed: true }, ['id', 'completed']).run();
```

The Command receives the Selection expression itself. It does not first read matching rows and
turn them into a list of ids.

## Delete a Selection

```ts
const removeArchived = TodoItem.selection(todo => todo.archived.eq(true))
  .delete()
  .run();

const removeAndReturnIds = TodoItem.selection(todo => todo.archived.eq(true))
  .deleteReturning(['id'])
  .run();
```

Returning variants make follow-up behavior explicit without changing the Command target.

## Cardinality travels with semantic inputs

An operation input declared as `self.one()` carries exact-one cardinality into its Commands:

```ts
rename: operation({
  input: O.object({
    todo: self.one(),
    title: self.fields.title,
  }),
  output: O.pick(self, ['id', 'title']),
  run: ({ todo, title }) =>
    todo.updateReturning({ title }, ['id', 'title']),
}),
```

`todo.updateReturning(...)` returns one projected TodoItem because `todo` already means exactly one.
A `self.many()` input produces an array from the same method. Lower-level `updateOne`,
`updateMany`, `deleteOne`, and `deleteMany` variants remain available when code must assert
cardinality without a semantic input carrying it.

## Command surface

| Target                  | Operators                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| Entity                  | `insert`, `insertReturning`, `insertMany`, `insertManyReturning` |
| Entity                  | `upsert`, `upsertMany`                                           |
| Generated client Entity | exact portable `create`                                          |
| Generated client Ref    | exact portable `update`, `delete`                                |
| Selection               | `update`, `updateReturning`                                      |
| Selection               | `delete`, `deleteReturning`                                      |
| Lower-level Query       | explicit `One` / `Many` update and delete variants               |

A simple operation returns its final Command directly:

```ts
complete: operation({
  input: O.object({ todos: self.many() }),
  run: ({ todos }) => todos.update({ completed: true }),
}),
```

When an operation must coordinate several reads, Commands, or capabilities, it can execute each
runtime computation and continue. Returning a final Command lets the operation runtime execute it;
calling `run()` executes an intermediate Command explicitly. The language remains the same in
either form.

## Keep Relationship Commands structural

Entity Commands mutate Entity instances or selected populations. A Relationship Command instead
preserves the intention to link or unlink one declared Relation:

```ts
const result =
  yield *
  student.course.assign(nextCourse, { ifCurrent: previousCourse, onMismatch: 'skip' }).run();
```

Its runtime resolves canonical endpoints, cardinality, nullability, participant constraints, and
the exact added/removed delta. The result is explicitly `applied` or `not-applied`; narrow its
status before reading `delta` or `diagnostic`. See [Relations](03-relations.md) for direct,
many-to-many, conditional, and Reaction lifecycles.

The remote graph bridge exposes policy-scoped Relationship Commands and exact Entity Mutation
Commands. It does not transport arbitrary Selection Commands, bulk mutation, insert/upsert, or an
open-ended provider Command. Writes outside the exact policy algebra remain named Operations until
Ontahí can preserve their affected fields, row scope, invariants, and reconciliation semantics.
