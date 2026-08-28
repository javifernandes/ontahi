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

Identity and locators come next. Relations, selections, and operations then extend this same
Entity rather than wrapping it in parallel models.
