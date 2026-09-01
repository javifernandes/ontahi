# Operations

An \concept{Operation} names something the application can do. It owns a public input, an
output, failures and contracts, runtime requirements, exposure, and an implementation.

A Query or Command describes a data interaction. An Operation gives that interaction application
meaning and may compose several Queries, Commands, capabilities, or durable steps behind one
stable contract.

## Name behavior beyond generic mutation

An Operation should name application behavior, not duplicate a generic Entity Command. In the Todo
example, list creation remains an Operation because it also emits an application notification:

```ts
operations: ({ self, commands, operation, app }) => ({
  createList: operation({
    input: O.pick(self, ['id', 'name']).named('CreateTodoListInput'),
    output: self,
    run: input =>
      Effect.gen(function* () {
        const created = yield* commands.insertReturning(input, ['id', 'name']).run();
        yield* app.runtime.notifications.todoListCreated({
          listId: created.id,
          name: created.name,
        });
        return created;
      }),
  }),
}),
```

The input schema is the public contract and the Command is the storage-neutral graph effect. A
plain rename or recolor uses an Entity update Command directly; wrapping either in a same-shaped
Operation would add vocabulary without behavior. Rich lifecycle work such as cascading list
deletion, notifications, authorization requirements, or durable execution still belongs in a
named Operation.

## Compose effectful bodies without wrapper ceremony

When an Operation needs sequential Effect composition, `run` may be authored directly as an
Effect generator:

```ts
transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(Student),
    nextCourse: graphSchema.existingRef(Course),
  }),

  *run({ student, nextCourse }) {
    const relationship = yield* students
      .refById(student.id)
      .currentCourse.assign(nextCourse.ref)
      .run();

    return relationship;
  },
}),
```

Ontahí recognizes the generator function itself and adapts it to an Effect when the Operation is
invoked. Input inference, UnitOfWork, contracts, atomic execution, typed failures, and defects use
the same runtime path as an explicitly returned Effect. Arbitrary iterators are not interpreted as
Operation programs.

`Effect.fn(...)` remains useful when the body is defined or reused as an ordinary Effect function:

```ts
run: Effect.fn(function* ({ value }) {
  const increment = yield* Effect.succeed(1);
  return { result: value + increment };
}),
```

Simple Operations should continue returning a Command, Selection, graph read, or Effect directly;
the generator form is only sequencing syntax.

> [!MARGIN] **The semantic identity of `name`.** A transport API often redeclares `name` in
> its request DTO. Even when both declarations validate the same values today, that loses the fact
> that this input _is_ `TodoList.name`. `name: self.fields.name` keeps that relationship explicit:
> its constraints and meaning evolve together. Ontahí's bias is to bring links like this out of the
> architecture's unconscious and into the model.

## Use them from Node

```ts
import { TodoItem, TodoList } from './graph.js';

const created = await TodoList.createList({
  id: crypto.randomUUID(),
  name: 'Research backlog',
});
if (!created.ok) throw new Error(`TodoList.createList failed: ${created.kind}`);

const list = TodoList.refById(created.value.id);

const deleted = await TodoItem.deleteList({ list });
if (!deleted.ok) throw new Error(`TodoItem.deleteList failed: ${deleted.kind}`);
```

The caller uses the entity, its locator, and its operations. It does not construct transport URLs,
write a storage query, or manually turn the Ref into a Selection.

## Shape a Selection result

An Operation may own membership while leaving result shape to its caller. Declare a Selection
output with `self.one()` or `self.many()`, and return that Selection without reading it:

```ts
available: operation({
  input: O.object({
    trips: self.many(),
  }),
  output: self.many(),
  run: ({ trips }) =>
    trips.and(trip => trip.status.eq('available')),
}),
```

The caller supplies a View and chooses when to execute:

```ts
const candidateTrips = Trip.selection(trip => trip.region.eq('south'));

const result = await Trip.available({ trips: candidateTrips }).as(TripList).run();

if (!result.ok) throw new Error(`Trip.available failed: ${result.kind}`);

const trips = result.value;
```

The Operation contributes the semantic population; the caller contributes the result shape. The
runtime combines both into one final Query instead of loading Entity snapshots and hydrating
Relations afterward.

Projectability is explicit. `self.one()` and `self.many()` produce lazy calls with `.as(view)`.
`self.array()`, Entity snapshots, and ordinary Value outputs remain fixed, eager results. A
projectable body must return a declarative Selection; calling `.run()` inside the body materializes
too early and prevents this composition.

Generated clients preserve projectability. In React, apply the View to the generated Operation and
pass the resulting operation value to `useOperationQuery`:

```tsx
const candidateTrips = useMemo(() => Trip.selection(trip => trip.region.eq('south')), []);

const trips = useOperationQuery(Trip.domain.available.as(TripList), { trips: candidateTrips });
```

The bridge transports the Selection input and the JSON-safe View AST. The server validates the View
against the Operation's declared `self.one()` or `self.many()` output, then performs the same single
composed Query as the local runtime. Durable Operations and fixed outputs do not expose `.as(view)`.

For diagnostics and tests, `as(view).inspect()` returns the composed Query without reading storage.
Application code normally uses `run()`.

## Use the same operations from React

A projected mutation opts into the bridge and declares which reads become stale after success:

```ts
exposure: 'bridge',
bridge: { invalidate: [['TodoList']] },
```

The generated operations then work through `useOperation`:

```tsx
const createList = useOperation(TodoList.domain.createList);
const deleteList = useOperation(TodoItem.domain.deleteList);

return (
  <div>
    <button
      disabled={createList.isExecuting}
      onClick={() =>
        void createList.executeAsync({
          id: crypto.randomUUID(),
          name: 'Research backlog',
        })
      }
    >
      Create
    </button>

    <button
      disabled={deleteList.isExecuting}
      onClick={() =>
        void deleteList.executeAsync({
          list: TodoList.refById(selectedListId),
        })
      }
    >
      Delete
    </button>
  </div>
);
```

The same Ref form crosses both Node and React boundaries. The hook supplies execution state; the
operation still owns the mutation.
