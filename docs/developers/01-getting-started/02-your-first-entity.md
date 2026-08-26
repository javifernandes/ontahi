# Your First Entity

An \concept{Entity} declares a named kind of thing.

```ts
import { field as f } from '@ontahi/core/data-graph';
import { entity } from '@ontahi/core/entity';

export const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: f.id(),
    name: f.nonEmptyString({ trim: true }),
  },
});
```

This guide imports the Field factory as `f`. The short alias keeps Entity declarations compact;
the model still reflects each value as a Field.

Fields describe its values. Part II opens this declaration and explains Entity identity, locators,
Relations, Selections, Queries, Commands, and Operations individually.

## Use it from Node

Import the Entity from the module that composes the application. At that point it is bound to the
selected runtime and its Queries can execute directly:

```ts
import { TodoList } from './graph.js';

const lists = await TodoList.all()
  .orderBy(list => list.name)
  .run();

for (const list of lists) {
  console.log(`${list.name} (${list.id})`);
}
```

There is no HTTP request, React component, or storage-specific query here. The semantic Query runs
through the application runtime selected at composition.

## Expose an explicit browser read surface

Registering an Entity does not grant remote access. A server-backed browser Query needs an explicit,
default-deny read policy:

```ts
const TodoListReadPolicy = {
  entity: TodoList,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 100,
  fields: {
    id: { select: true, filter: ['eq'] },
    name: { select: true, order: true },
  },
  scope: 'all',
} satisfies GraphReadPolicy<typeof TodoList>;
```

`scope: 'all'` is deliberate public access. An authenticated application can instead derive a
Selection from server-owned authority. The runtime chapters develop this boundary and mount the
policy through Express or Next.js.

## Generate the client projection

A Node-only application does not need codegen. Add it when code in another environment—such as a
browser—needs to use the application model:

```sh
pnpm add --save-exact @ontahi/react@alpha
pnpm add @tanstack/react-query
pnpm add --save-exact --save-dev @ontahi/codegen@alpha
```

For the conventional `src/graph.ts` composition root, no generation script is necessary:

```json
{
  "scripts": {
    "codegen": "ontahi-codegen",
    "codegen:check": "ontahi-codegen --check"
  }
}
```

```sh
pnpm codegen
```

The command generates `src/generated/client-entities.ts`. It analyzes the same application but
projects only browser-safe schemas and bridge-exposed Operation contracts. Implementations,
Capabilities, storage, secrets, and server-only operations do not cross that boundary.

> [!MARGIN] **More than a transport specification.** The pressure resembles generating an OpenAPI
> document from an HTTP API, but the result is not merely a route and payload description. Ontahí
> emits an executable semantic projection that preserves Entity identity, relations, Selections,
> and operation contracts independently of the transport carrying them.

React uses that generated projection directly. A caller-owned View chooses the result shape:

```tsx
import { useGraphQuery } from '@ontahi/react/graph';
import { TodoList } from './generated/client-entities.js';

const TodoListRow = TodoList.view('TodoListRow', {
  id: true,
  name: true,
});

const todoLists = TodoList.all()
  .as(TodoListRow)
  .orderBy(list => list.name);

export const TodoLists = () => {
  const lists = useGraphQuery(todoLists);

  if (lists.isLoading) return <p>Loading lists…</p>;
  if (lists.isError) return <p>Could not load lists.</p>;

  return (
    <ul>
      {lists.data?.map(list => (
        <li key={list.id}>{list.name}</li>
      ))}
    </ul>
  );
};
```

The hook adds browser lifecycle state; it does not redefine the Entity or invent an application
endpoint. Query-cache and transport mechanics remain outside this first use.

## One semantic declaration

The Entity is the shared source for identity, graph behavior, Operations, reflection, storage
adapters, and generated projections. The read policy remains a separate server boundary. Those
surfaces compose one model; they are not parallel schemas.
