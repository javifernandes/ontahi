# Operations

An \concept{Operation} names something the application can do. It owns a public input, an
output, failures and contracts, runtime requirements, exposure, and an implementation.

A Query or Command describes a data interaction. An Operation gives that interaction application
meaning and may compose several Queries, Commands, capabilities, or durable steps behind one
stable contract.

## Name behavior on the Entity

Create, rename, and delete are TodoList operations:

```ts
operations: ({ self, commands, operation }) => ({
  create: operation({
    input: O.pick(self, ['id', 'name']).named('CreateTodoListInput'),
    output: self,
    run: input => commands.insertReturning(input, ['id', 'name']),
  }),

  rename: operation({
    input: O.object({
      list: self.one(),
      name: self.fields.name,
    }),
    output: self,
    run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
  }),

  delete: operation({
    input: O.object({
      list: self.one(),
    }),
    run: ({ list }) => list.delete(),
  }),
}),
```

The input schema is the public contract. The command is the storage-neutral effect. Because
`list` is declared as `self.one()`, its fluent mutations already carry exact-one cardinality;
there is no `updateOne` or `deleteOne` ceremony to repeat. `create`, `rename`, and `delete` are
domain vocabulary available to every host.

> [!MARGIN] **The semantic identity of `name`.** A transport API often redeclares `name` in
> its request DTO. Even when both declarations validate the same values today, that loses the fact
> that this input _is_ `TodoList.name`. `name: self.fields.name` keeps that relationship explicit:
> its constraints and meaning evolve together. Ontahí's bias is to bring links like this out of the
> architecture's unconscious and into the model.

## Use them from Node

```ts
import { TodoList } from './graph.js';

const created = await TodoList.create({
  id: crypto.randomUUID(),
  name: 'Research backlog',
});
if (!created.ok) throw new Error(`TodoList.create failed: ${created.kind}`);

const list = TodoList.refById(created.value.id);

const renamed = await TodoList.rename({
  list,
  name: 'Research queue',
});
if (!renamed.ok) throw new Error(`TodoList.rename failed: ${renamed.kind}`);

const deleted = await TodoList.delete({ list });
if (!deleted.ok) throw new Error(`TodoList.delete failed: ${deleted.kind}`);
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
const createList = useOperation(TodoList.domain.create);
const renameList = useOperation(TodoList.domain.rename);
const deleteList = useOperation(TodoList.domain.delete);

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
      disabled={renameList.isExecuting}
      onClick={() =>
        void renameList.executeAsync({
          list: TodoList.refById(selectedListId),
          name: 'Research queue',
        })
      }
    >
      Rename
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
