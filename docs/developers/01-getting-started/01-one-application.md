# One Application

An Ontahí application begins by declaring what exists and choosing the runtimes that can carry it.

Install the framework package at the current public alpha:

```sh
pnpm add --save-exact @ontahi/core@alpha
```

```ts
export const TodoApplication = ontahi({
  storage: createInMemoryDataGraphStorage(),
  tasks: inProcessTasks(),
  entities: [TodoList, Tag, TodoItem],
});
```

`TodoApplication` is the composition root. Its entities describe the application model. Storage
interprets graph reads and changes. The task runtime executes durable work.

The result is a runnable application, not only a registry. It can invoke operations, reflect its
model, provide data to Ontahí Explorer, and project browser-safe clients from the same declaration.

## Keep one model

The application is the meeting point between semantic declarations and runtime implementations:

```text
entities + operations  ->  application  ->  storage + tasks + transport
```

The declarations do not contain database pools, HTTP middleware, or worker lifecycle. The runtime
does not reconstruct Entities and operation contracts from another configuration. The application
binds both sides once.

## Mount it in a host

Install Express and its Ontahí runtime adapter:

```sh
pnpm add express
pnpm add --save-exact @ontahi/runtime-express@alpha
```

Then mount the composed application like any other Express middleware:

```ts
import { ontahiExpress } from '@ontahi/runtime-express';
import express from 'express';

const server = express();

server.use(ontahiExpress(TodoApplication));
server.listen(3001);
```

The adapter gives existing operations, reflection, task snapshots, and Explorer data an HTTP
surface. It does not define a second application.

For now, the in-memory storage and task runtime are enough. Part III replaces them with persistent
storage, workers, transports, and host capabilities without changing the Entity declarations.

The next chapter adds the first Entity and calls one of its operations from Node and React. The
complete application is runnable in the
[`todo-express` example](https://github.com/javifernandes/ontahi/tree/main/examples/todo-express).
