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
