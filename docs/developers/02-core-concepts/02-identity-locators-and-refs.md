# Identity, Locators, and Refs

\concept{Identity} says what makes one instance of an Entity the same instance across reads,
operations, processes, and time. A \concept{Locator} names a valid way to express that identity.

## Conventional identity

The common declaration places identity at the field itself:

```ts
export const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: f.id(),
    name: f.nonEmptyString({ trim: true }),
  },
});
```

An exact, required `id: f.id()` gives TodoList a `refById` locator and makes it the
default identity. The Entity can be addressed immediately:

```ts
const listA = TodoList.refById('A');
```

The convention is deliberately narrow. A scalar field such as `legacyOwnerId` remains an ordinary
id value unless it is declared as `f.ref(Owner)`, and an optional or nullable `id` does not
silently become the Entity identity.

## Alternate locators

A domain may expose more than one stable way to locate the same Entity:

```ts
export const Book = entity({
  name: 'Book',
  fields: {
    id: f.id(),
    slug: f.slug(),
    title: f.nonEmptyString({ trim: true }),
  },
  locators: {
    refBySlug: 'slug',
  },
});
```

The explicit locator composes with the convention:

```ts
Book.refById('book-42');
Book.refBySlug('living-systems');
```

`refById` remains the default identity used to derive a canonical Ref from a materialized Book.
When another locator must be canonical, declare that difference explicitly with
`identity: 'refBySlug'`.

## Identity as a value

A \concept{Ref} is a value that references one particular instance of an Entity.

```ts
import { TodoList } from './graph.js';

const listA = TodoList.refById('A');
```

`listA` is not a TodoList record or a snapshot of its fields. It models the semantic identity of
that instance as ordinary data:

```ts
{
  kind: 'entity-ref',
  entityName: 'TodoList',
  locator: { id: 'A' },
}
```

Like a Promise lets application code speak about a value before that value is available, a Ref
lets application code describe work involving an Entity instance without first deciding how to
find it, load it, or transport it. The Ref can cross operation boundaries and become part of a
Selection while Ontahí's runtime decides when its identity must be interpreted.

The Ref does not claim that the instance exists or contain its current fields. It carries enough
meaning to refer to it.

## Act on the Ref

An operation that accepts one TodoList declares that cardinality through the Entity itself:

```ts
rename: operation({
  input: O.object({
    list: self.one(),
    name: f.nonEmptyString({ trim: true }),
  }),
  output: self,
  run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
}),
```

Call it with the Ref directly:

```ts
import { TodoList } from './graph.js';

const listA = TodoList.refById('A');
const result = await TodoList.rename({
  list: listA,
  name: 'Research backlog',
});

if (!result.ok) throw new Error(`TodoList.rename failed: ${result.kind}`);
console.log(result.value);
```

The operation receives a semantic target, not a caller-owned snapshot. The Ref preserves which
TodoList the caller means until the runtime interprets that identity.

> [!MARGIN] **The domain link that an id loses.** A REST endpoint or GraphQL field commonly
> receives `listId: ID` because its input language stops at the transport boundary. The scalar
> carries a value, but not the fact that the operation expects one TodoList. Each handler or
> resolver must then interpret the id, load the Entity, handle its absence, and mix that plumbing
> into the application behavior. Ontahí puts the semantic target in the operation contract as
> `self.one()`. A boundary may encode it as an id, but the operation remains defined in terms of
> the domain. That abstraction lets Refs, records, and Selections compose without rewriting the
> operation for each transport or way of locating its target.

## Resolve a Ref only when behavior needs current state

`self.one()` above is a Selection-valued operation target: it preserves a population and exact-one
cardinality for a Query or Command. When operation behavior needs the current attributes of one
referenced Entity, declare that value directly as a Reference Field in the input schema:

```ts
transfer: operation({
  input: graphSchema.object({
    student: f.ref(self),
    previousCourse: f.ref(Course),
    nextCourse: f.ref(Course),
  }),
  run: ({ student, previousCourse, nextCourse }) =>
    Effect.gen(function* () {
      const currentStudent = yield* student.resolve();
      const previous = yield* previousCourse.resolve();
      const next = yield* nextCourse.resolve();

      // Decide the transition from authoritative state.
      return { currentStudent, previous, next };
    }),
}),
```

The public input still contains ordinary portable Refs. The server runtime adds the non-enumerable
`resolve()`, `invalidate()`, and `refresh()` methods only to the normalized values received by the
operation implementation; callers and serialized payloads never receive executable methods.

Resolution is explicit I/O. It builds an authorized Entity Query through the active Data Graph
runtime and keeps the result in the current operation's \concept{UnitOfWork}. Repeated
`student.resolve()` calls in that UnitOfWork reuse the same in-flight or completed resolution.
Different projections and execution identities remain isolated. Use `student.invalidate()` to
evict its resolutions or `student.refresh()` to evict and immediately load again.

Ontahí does not infer invalidation from arbitrary Commands yet. A separate top-level operation and
a transaction child UnitOfWork also start with fresh Ref-resolution stores, so neither becomes a
cross-request cache. The executable
[`Student.transfer`](../../../examples/classroom/src/classroom.ts) operation uses this exact form.

## Composite identity

Some identities need more than one field:

```ts
export const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    student: f.ref(Student),
    course: f.ref(Course),
    status: f.string(),
  },
  locators: {
    refByStudentAndCourse: ['student', 'course'],
  },
  identity: 'refByStudentAndCourse',
  operations: ({ self, operation }) => ({
    withdraw: operation({
      input: O.object({
        enrollment: self.one(),
      }),
      run: ({ enrollment }) => enrollment.delete(),
    }),
  }),
});
```

Because Enrollment has state and lifecycle of its own, it is an Entity rather than anonymous
many-to-many topology. It still needs no synthetic ID when its participants form its identity:

```ts
const enrollment = Enrollment.refByStudentAndCourse(student, course);
const result = await Enrollment.withdraw({ enrollment });

if (!result.ok) throw new Error(`Enrollment.withdraw failed: ${result.kind}`);
```

The locator carries both participant Refs, so the association can cross an operation boundary by
semantic identity. A pure link such as `TodoItem.tags` remains a direct many-to-many Relation and
uses Relationship Commands instead of becoming an Entity only to represent its join table.

## The object does not cross the boundary

A React screen may first read and render complete TodoList records:

```tsx
const TodoListRow = TodoList.view('TodoListRow', { id: true, name: true });
const lists = useGraphQuery(TodoList.all().as(TodoListRow));
const rename = useOperation(TodoList.domain.rename);

return lists.data?.map(list => (
  <button
    key={list.id}
    onClick={() =>
      void rename.executeAsync({
        list,
        name: 'Research queue',
      })
    }
  >
    Rename {list.name}
  </button>
));
```

At the call site, `list` is a materialized object. It may feel like ordinary object-oriented code:
the UI has a TodoList and acts on that TodoList. But the complete object is not sent back to the
server. Because TodoList declares its identity, the generated boundary derives a Ref from
`list.id` and transports the semantic target instead.

The server operation interprets that target in its own runtime. It never treats the fields held by
the browser as the current or authoritative TodoList.

## One operation, many ways to name its target

An operation becomes more useful when it does not reduce its target to an `entityId` parameter.
The same `complete` operation can receive identities typed by hand, records selected in the UI, or
a criterion that has not been evaluated yet:

```tsx
const complete = useOperation(TodoItem.domain.complete);

await complete.executeAsync({
  todos: ['23'],
});

await complete.executeAsync({
  todos: selectedTodos,
});

await complete.executeAsync({
  todos: TodoItem.selection(todo => todo.list.eq(TodoList.refById('list-research'))),
});
```

The first call means “complete todo item 23.” The second means “complete these todo items selected
in the UI.” The third means “complete every todo item in the research list.” No preliminary read is required:
the criterion remains a lazy description until the operation runs.

The implementation of `complete` is identical in all three cases. Ontahí normalizes each target to
the operation's semantic input and delegates its interpretation to the runtime. The same input
forms work when calling `TodoItem.complete(...)` directly from Node or through the generated client.

> [!MARGIN] **Beyond `completeById`.** A transport API often grows `completeById`,
> `completeSelected`, and `completeOlderThan`, or introduces a custom filter input and its
> interpreter. Ontahí carries GraphQL's declarative instinct into operation targets: one domain
> operation accepts a Ref or Selection, while each caller chooses how to describe membership.
