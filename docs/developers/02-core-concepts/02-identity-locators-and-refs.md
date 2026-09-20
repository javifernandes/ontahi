# Identity, Refs, and Named Selections

\concept{Identity} says what makes one instance of an Entity the same instance across reads,
operations, processes, and time. A \concept{Ref} carries an identity without loading the record.
A named Selection factory describes how to select instances; its inputs need not be identity
fields, and its result need not contain exactly one instance.

Keep these contracts separate:

| Contract                  | Describes                                                        | Does not establish                               |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Canonical identity        | Which instance a record represents                               | Whether the caller can see it                    |
| Ref                       | A portable reference to an instance                              | Existence or current attributes                  |
| `by({ factory: inputs })` | Deferred membership, built from a declared input schema          | Uniqueness, existence, or a new identity         |
| `existingRef(Entity)`     | An authorized participant required before an Operation body runs | A reusable cache or arbitrary deferred criterion |

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

An exact, required `id: f.id()` establishes the conventional identity. A portable Ref can be
constructed immediately:

```ts
import { createEntityRef } from '@ontahi/core/data-graph';

const listA = createEntityRef(TodoList, { id: 'A' });
```

The current SDK also supplies `TodoList.refById('A')`. These locator factories remain supported;
adding `by` has not removed the Ref contract or changed canonical cache identity.

The convention is deliberately narrow. A scalar field such as `legacyOwnerId` remains an ordinary
id value unless it is declared as `f.ref(Owner)`, and an optional or nullable `id` does not
silently become the Entity identity.

## Choose a Ref or a named Selection

Use a Ref when the caller already knows the identity. Use a Selection when the caller chooses
criteria whose matching population the receiver will interpret later. For example, after declaring
the factories in [Selections](04-selections.md#declare-a-named-selection-factory):

```ts
const knownTag = createEntityRef(Tag, { id: 'tag-work' });
const matchingTags = Tag.by({ named: 'Work' });
const oneKnownMember = Tag.by({ identity: 'tag-work' });
```

All three values are constructed without a read. The first is a Ref; the others are Selections.
The `identity` factory uses canonical identity membership, while `named` expands to a Field
predicate. A name match can yield zero, one, or many Tags. Neither factory invents another cache key
for the same Tag, and naming a factory does not give its caller extra permission.

This is why `by` is useful beyond the older locator model: an input such as `archivedSince.date`
can describe a criterion over `archivedAt`, rather than naming a Field or identifying one record.
The factory owns input validation and expansion; the consumer owns cardinality and execution.

## Existing alternate-locator contracts

Existing applications may expose more than one supported lookup for a Ref through `locators`:

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

This is still a supported declaration, not a removed API. For new reusable search criteria,
declare a named Selection factory instead of adding a `refByX` method. Migrating a lookup to `by`
does not require changing an Entity's canonical identity, its stored Ref Fields, or an Operation
that genuinely requires an existing participant. Composite identity below still uses the current
locator-based identity declaration; `by` is not its replacement.

## Identity as a value

A \concept{Ref} is a value that references one particular instance of an Entity.

```ts
import { TodoList } from './graph.js';

const listA = createEntityRef(TodoList, { id: 'A' });
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

const listA = createEntityRef(TodoList, { id: 'A' });
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

## Resolve current state explicitly or require an existing participant

`self.one()` above is a Selection-valued operation target: it preserves a population and exact-one
cardinality for a Query or Command. When operation behavior may proceed without current attributes
or needs to control refresh and invalidation itself, declare a Reference Field in the input schema
and resolve it explicitly:

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

When the body cannot proceed unless the referenced Entity is visible, express that requirement in
the same input field instead of repeating `resolve()` and an absence branch:

```ts
transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(self),
    previousCourse: graphSchema.existingRef(Course),
    nextCourse: graphSchema.existingRef(Course),
  }),
  run: ({ student, previousCourse, nextCourse }) =>
    students
      .refById(student.id)
      .currentCourse.assign(nextCourse.ref, { ifCurrent: previousCourse.ref })
      .run(),
}),
```

Callers still pass the same portable Refs. The body receives authorized Entity records directly;
their non-enumerable `.ref` properties preserve the original portable identities. A missing or
policy-filtered participant fails before the body with `entity_not_found`, plus the safe Entity
name and input path. Resolution uses the active Data Graph Query runtime and UnitOfWork, and an
atomic Operation performs it inside its selected transaction boundary.

`existingRef` currently supports direct fields of object and Value Operation inputs, including
optional and nullable wrappers. Nested collections and durable Operations are rejected until their
resolution lifecycles are defined. Explorer reflects the requirement as `Existing<Entity>`; it
does not transport the resolved record.

Ontahí does not infer invalidation from arbitrary Commands yet. A separate top-level operation and
a transaction child UnitOfWork also start with fresh Ref-resolution stores, so neither becomes a
cross-request cache. The executable Enrollment lifecycle uses explicit resolution, while
[`Student.transfer`](../../../examples/classroom/src/classroom.ts) demonstrates `existingRef`.

## Require a classified participant

An Operation can require the classified Entity introduced in the previous chapter:

```ts
input: graphSchema.object({ chapter: graphSchema.existingRef(Chapter) });
```

The caller sends a canonical ContentNode Ref. The receiver resolves and validates the complete base
record, verifies the identity and requires the Chapter discriminator before entering the body.
The body receives a narrowed Chapter record with its canonical `.ref`. A missing, wrong-kind,
wrong-identity or visibility-filtered record yields `entity_not_found` without exposing which check
failed. Host-owned resolution still determines visibility; read-root registration does not authorize
Operation participants.

This is deliberate materialization, not a deferred Selection parameter. A `.resolveWith(...)`
resolver must return a complete base Entity record, not a location DTO. Direct optional/nullable
inputs and their generated contracts are supported; nested participants, stored variant Ref Fields
and deferred classified Operation inputs are not part of this slice.

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
