# Entities

An \concept{Entity} is a named kind of domain thing. It declares the fields that describe one
instance and becomes the semantic root for identity, relations, selections, operations,
reflection, and storage interpretation.

```ts
export const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: f.id(),
    list: f.ref(TodoList),
    title: f.nonEmptyString({ trim: true, maxLength: 200 }),
    completed: f.boolean(),
    priority: f.enum(['low', 'normal', 'high', 'critical'] as const),
    assigneeId: f.nullable(f.id()),
    dueAt: f.nullable(f.datetime()),
    createdAt: f.datetime(),
    archived: f.boolean(),
  },
});
```

`TodoItem` is both a declaration and a typed value available to the rest of the application. Ontahí
does not derive the Entity from storage tables or from a transport schema.

The core chapters use this slightly richer TodoItem so each operator can stay small and concrete.

## Fields are reusable semantic values

A field definition carries its value type, constraints, nullability, and reflected presentation.
The declaration can be reused wherever the same value appears:

```ts
operations: ({ self, operation }) => ({
  rename: operation({
    input: O.object({
      todo: self.one(),
      title: self.fields.title,
    }),
    output: O.pick(self, ['id', 'title']),
    run: ({ todo, title }) => todo.updateReturning({ title }, ['id', 'title']),
  }),
}),
```

`title: self.fields.title` states that the operation input is the same semantic field as
`TodoItem.title`. Validation, reflection, code generation, and clients preserve that link.

Common field constructors cover identities, constrained strings, numbers, booleans, dates, enums,
JSON values, and optional or nullable values:

```ts
const fields = {
  id: f.id(),
  slug: f.slug(),
  email: f.email(),
  priority: f.integer({ min: 0, max: 5 }),
  status: f.enum(['open', 'done'] as const),
  publishedAt: f.optional(f.datetime()),
};
```

## Derived Fields are ordinary read-only Fields

A value calculated from authoritative graph state still belongs under `fields`. `field.derived(...)`
keeps its scalar contract while declaring the calculation in the same model vocabulary:

```ts
const CourseFields = {
  id: f.id(),
  capacity: f.nonNegativeInteger(),
  occupiedSeats: f.derived(f.nonNegativeInteger(), ({ students }) => students.count()),
  availableSeats: f.derived(
    f.nonNegativeInteger(),
    ({ capacity, students }) => capacity - students.count(),
  ),
};
```

The callback is build-time authoring, not arbitrary runtime code. Codegen compiles its known Field
and Relation symbols into versioned Model Expression data and reports unsupported syntax at the
source. A runtime-only declaration can pass an explicit `modelExpression.define(...)` program as
the second argument.

Derived Fields participate in Entity values, Views, Queries, JSON Schema, and reflection like other
Fields, but Commands cannot assign them and storage mappings do not create columns for them.
In-memory and PostgreSQL runtimes evaluate the same expression over complete graph evidence. For a
remote graph read, policy must allow the derived Field and every stored Field or Relation aggregate
dependency; Ontahí does not calculate a count from a partial client cache or visible Explorer page.

The first slice is virtual only. It does not create database triggers, materialized values, or
permanent aggregate invariants, and it intentionally does not allow one derived Field to depend on
another.

## Name a classified population without another identity

An experimental Entity variant gives a fixed classification its own name and narrowed read types:

```ts
const ContentNode = entity({
  name: 'ContentNode',
  fields: {
    id: f.id(),
    type: f.enum(['part', 'chapter'] as const),
    title: f.string(),
  },
});
const Chapter = ContentNode.variant('Chapter', { discriminator: { type: 'chapter' } });
const introductions = Chapter.where(node => node.title.eq('Introduction')).many();
```

This names a domain population that previously appeared only as repeated `type = 'chapter'`
filters. Predicate callbacks and read results narrow `type` to the literal `'chapter'`. Chapter
inherits the base's Fields, declared Selection factories and contextual navigation; it is not a
new table or a JavaScript subclass with another lifecycle.

| Form                                 | What it adds                                           |
| ------------------------------------ | ------------------------------------------------------ |
| `Selection.where(ContentNode, ...)`  | An ad hoc membership criterion over ContentNodes       |
| `Chapter = ContentNode.variant(...)` | A named classified population with narrowed read types |
| `ContentNode.view(...)`              | A shape for materialized results, not a new population |

`Chapter.all()` describes only chapters. `not()` complements within that population, never within
all ContentNodes. The discriminator is enforced outside caller membership expressions. Use
`Chapter.from(baseSelection)` to narrow a base Selection explicitly; no rows are fetched by doing so.

A Chapter still has ContentNode identity and storage. Create Refs through `Chapter.base`, not a new
Chapter identity namespace. Base and classified snapshots normalize to the same canonical record;
a cached base record alone is not proof of current Chapter membership.

```ts
const otherChapters = Chapter.where(node => node.title.eq('Introduction')).not();
const fromSelection = Chapter.from(
  Selection.where(ContentNode, node => node.title.eq('Introduction')),
);
const chapterRef = createEntityRef(Chapter.base, { id: 'chapter-42' });
```

`otherChapters` never includes parts. `fromSelection` intersects the caller's criterion with the
classifier; it does not cast an arbitrary record into a Chapter. `chapterRef` is still a
ContentNode Ref and alone makes no promise about the record's current `type`.

The terminals `many`, `one`, `first`, `count` and `exists` apply after classification. For an
unbound variant they prepare read programs, not I/O; execute through a Data Graph runtime or
bind explicitly with `createRuntimeBoundDataGraphApi(...).bindVariantSelection(...)`.
If the base declares named factories, `Chapter.by(...)` reuses those contracts inside the Chapter
population. It does not generate a fresh set of factories or locators.

### Carry classification through navigation and Operation inputs

A contextual declaration can select related chapters without spelling the discriminator again:

```ts
selections: ({ self }) => ({
  chapters: self.children.as(Chapter),
}),
```

Here `children` is an existing Relation to the same ContentNode definition from which Chapter was
declared. `.as(Chapter)` narrows membership; unlike `.as(aView)` on a Query, it is not output
projection. A Book's declared `parts` can then compose with `parts.chapters`, retaining each
classification and the base identity through the path.

When an Operation needs current attributes of a Chapter, put that participant in its input tree:

```ts
const ReadChapterInput = graphSchema.object({
  chapter: graphSchema.existingRef(Chapter),
});
```

The caller supplies a ContentNode Ref. The runtime resolves the authorized base record and checks
classification before entering the body. The implementation receives a narrowed record with its
canonical `.ref`, not `bookSlug`, `partSlug` and `chapterSlug` navigation inputs. Choosing a Chapter
through a cascading Book → Part → Chapter UI is a separate interaction concern. See
[classified participants](02-identity-locators-and-refs.md#require-a-classified-participant)
for resolution and failure behavior.

### Expose classified reads deliberately

A remote client does not grant itself a new root by inventing the name `Chapter`. The receiver
registers the variant on the **base** read policy:

```ts
const contentReadPolicy = {
  entity: ContentNode,
  variants: [Chapter],
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 25,
  fields: {
    id: { select: true },
    type: { select: true },
    title: { select: true, filter: ['eq'], order: true },
  },
  scope: 'all', // choose the host's actual authority-dependent scope
} satisfies GraphReadPolicy;
```

`GraphReadPolicy` is exported from `@ontahi/core/data-graph`. Pass this policy to the host's
Graph Read dispatcher. Classification and the base authority scope are applied outside caller
`not`/`or`, and all other grants remain those of the base policy. Discovery advertises the registered
root without fetching records. Console then accepts `Chapter.many()` or `Chapter many` and
completes its inherited Fields and narrowed enum values; no hand-written client Chapter registry
is required.

The supported classifier is one required, stored, non-null enum Field. Remote reads require explicit
variant registration on the base read policy, and inherit its grants and authority scope. This is
not general schema inheritance: variant writes, classification transitions, variant-root Console
Views and standalone generated variant exports remain deferred. Existing base mutations are not
disabled by declaring a variant. See the [Core contract](../../../packages/core/README.md#experimental-entity-variant-reads)
for registration and runtime binding.

## `self` keeps Entity-shaped contracts local

Inside `operations`, `self` refers to the Entity being declared:

| Form                | Meaning                                        |
| ------------------- | ---------------------------------------------- |
| `self`              | one materialized Entity value                  |
| `self.array()`      | an array of materialized Entity values         |
| `self.one()`        | a semantic target with exactly-one cardinality |
| `self.many()`       | a semantic target with many cardinality        |
| `self.fields.title` | the declared `title` field schema              |

Materialized values describe data returned by an operation. Semantic targets describe which
Entities an operation may act on without requiring them to be loaded first.

## Presentation remains part of the declaration

Reflection consumers can discover how an Entity presents itself without inventing labels in every
client:

```ts
export const TodoItem = entity({
  name: 'TodoItem',
  fields: todoItemFields,
  display: {
    primary: 'title',
    secondary: ['completed'],
    search: ['title'],
  },
});
```

This metadata does not render a UI. It preserves knowledge that Explorer, generated clients, or a
future client may interpret.

Identity, Refs and named criteria come next. Relations, selections, and operations then extend this same
Entity rather than wrapping it in parallel models.
