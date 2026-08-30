# Operation Contracts and Failures

An \concept{Operation Contract} says which values may enter, which values may leave, and which
failures or requirements are part of the operation's public meaning. Put every condition knowable from those
values in that schema. Reserve executable preconditions for facts that must be resolved when the
operation runs.

## Make static rules visible

`Archive` is a reserved TodoList name. That is a property of the Entity field, not a dynamic
precondition:

```ts
export const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: f.id(),
    name: f.nonEmptyString({
      trim: true,
      exclude: {
        values: ['archive'],
        caseInsensitive: true,
      },
      messages: {
        exclude: 'Archive is reserved for system use.',
      },
    }),
  },
  operations: ({ self, operation }) => ({
    rename: operation({
      input: O.object({
        list: self.one(),
        name: self.fields.name,
      }),
      output: self,
      run: ({ list, name }) => list.updateReturning({ name }, ['id', 'name']),
    }),
  }),
});
```

`exclude` is reflected schema data. The server validates it, codegen preserves it, and a UI can
inspect the same values and message before invoking the operation. Nothing needs to execute to
discover that `Archive` is outside the accepted set. `rename` reuses `self.fields.name`; inputs
derived with `O.pick(...)` inherit it too.

## Validate an operation input

The operation owns the parser for its complete input:

```ts
const validation = TodoList.domain.rename.input.safeParse({
  list: TodoList.refById('list-research'),
  name: 'Archive',
});

if (!validation.success) {
  console.error(validation.issues[0]?.message);
}
```

`safeParse` accepts the same public values as the operation. It validates fields and normalizes
Refs or identity values into the semantic input the runtime understands. This is the low-level API
for code that needs to inspect a draft without executing it.

## Own the draft and execution together in React

When a component is editing the input it will later invoke, `useOperation` keeps those two parts as
one unit:

```tsx
const {
  input,
  execute: rename,
  isExecuting,
} = useOperation(TodoList.domain.rename, {
  list: TodoList.refById(selectedListId),
  name: '',
});

return (
  <form
    onSubmit={event => {
      event.preventDefault();
      rename();
    }}
  >
    <input
      value={input.draft.name}
      onChange={event => input.setField('name', event.target.value)}
    />

    <button disabled={!input.isValid || isExecuting} type='submit'>
      Rename
    </button>

    {input.issue('name') && <p>{input.issue('name')?.message}</p>}
  </form>
);
```

`input.draft` is the editable public value. `input.value` is its parsed, normalized value when
`input.isValid` is true. Calling `rename()` executes that value, so the component cannot validate
one object and accidentally send another. The server still validates the input authoritatively.

This is a headless operation-input model, not a visual form framework. The component decides how to
render fields and errors; the operation supplies their meaning. Another UI can consume the same
contract without duplicating `archive` as UI knowledge.

## Declare portable input conditions

A named `contracts.pre` condition is source authoring for portable Model Expression metadata. The
first supported Operation slice compares input Ref identity:

```ts
transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(Student),
    previousCourse: graphSchema.existingRef(Course),
    nextCourse: graphSchema.existingRef(Course),
  }),

  contracts: {
    pre: {
      differentCourses: ({ previousCourse, nextCourse }) =>
        !previousCourse.is(nextCourse),
    },
  },

  *run({ student, previousCourse, nextCourse }) {
    // authoritative stateful work
  },
}),
```

Codegen analyzes the expression-bodied callback without invoking it and emits versioned JSON-safe
portable expression metadata. The server application and generated clients import the same
condition registry. The authoring callback is never a runtime fallback: missing or stale generated
metadata fails during application composition. Unsupported syntax fails codegen at its source line
rather than becoming opaque JavaScript.

Every condition has a stable id such as `Student.transfer.pre.differentCourses`, declared input
dependencies, and the conventional `operation_condition_rejected` failure. A client with the
dependencies can evaluate it before invocation:

```ts
const condition = Student.domain.transfer.conditions?.pre[0];

if (condition) {
  const result = evaluatePortableOperationCondition(condition, {
    previousCourse,
    nextCourse,
  });

  // satisfied | rejected | unknown
}
```

This is advisory UX. The authority evaluates the same portable expression again immediately before
the body. A client result never reserves state or substitutes for authoritative execution.
`unknown` means a dependency is unavailable; it is not rejection or permission denial.

Runtime-only applications can author the same portable expression explicitly with
`modelExpression.condition(modelExpression.define(...))`. That is a parity escape hatch for
environments without source analysis, not a second semantic model.

## Keep opaque dynamic checks explicit

Queries, Capabilities, time, and arbitrary Effect programs are not portable conditions. Put these
checks in the explicit `contract(...)` concern. Uniqueness, for example, depends on current
application state. A `create` Operation may query for an existing TodoList before running its
Command:

```ts
operations: ({ self, commands, operation, app }) => ({
  create: operation({
    input: O.pick(self, ['id', 'name']).named('CreateTodoListInput'),
    output: self,
    concerns: [
      app.validation.contract({
        pre: ({ name }) =>
          commands
            .where(list => list.name.eq(name))
            .exists()
            .thenIf(
              app.operation.fail(
                'todo_list_name_taken',
                'A TodoList already uses that name.',
              ),
            ),
      }),
    ],
    run: input => commands.insertReturning(input, ['id', 'name']),
  }),
}),
```

This precondition cannot be decided from the input alone. It resolves graph state immediately
before the operation body. `exists()` is a lazy boolean computation; `thenIf(...)` chooses the
computation to continue with. Here the true branch fails and the omitted false branch does nothing.
No row needs to be materialized.

Executable checks are necessarily less transparent than schema constraints and Model Expressions.
The callback cannot be serialized or reflected with trustworthy dependencies. Reflection may at
most report it as an opaque server-only concern; a client cannot predict it without executing the
required reads under authority.

> [!MARGIN] **The shortcut is not the contract.** `thenIf(...)` is fluent composition for the
> common boolean case. An opaque `pre` check may still return synchronously, return a Promise, or
> return an Effect. That freedom is useful, but it is also why `contract(...)` is explicitly
> server-only and opaque to reflection. The runner recognizes this concern as the opaque contract
> phase so atomic Operations keep its pre/body/post work inside one rollback boundary. Top-level
> `contracts.pre` now accepts named portable declarations only.

## Check the result with a postcondition

Portable postconditions are not part of the first Model Expression bridge. An opaque postcondition
receives both the accepted input and the result:

```ts
concerns: [
  app.validation.contract({
    post: ({ id }, created) =>
      created.id === id
        ? undefined
        : app.operation.createFailure(
            'unexpected_created_identity',
            'The created TodoList has a different identity.',
          ),
  }),
],
```

Returning a failure changes the operation result. It does not undo effects the body already
performed, so a current callback postcondition is an assertion—not a transaction or rollback
policy. A future stateful postcondition that promises rollback needs an explicit atomic Operation
boundary; the existing spelling alone does not supply one.

## Gate execution with requirements

`requires` is for a reusable runtime gate rather than a fact asserted by this operation:

```ts
rename: operation({
  requires: [todoListWritesEnabled],
  input: O.object({
    list: self.one(),
    name: self.fields.name,
  }),
  // ...
}),
```

A requirement may inspect the normalized input and runtime context to answer questions such as
whether a feature is enabled or an actor may attempt the operation. Requirements run before
contracts and the body, and the same requirement can be installed across a layer of operations.

Ontahí now provides a provider-neutral Principal and `app.require.authenticated()` for the basic
authentication gate. Authorization authoring is still being consolidated. `todoListWritesEnabled`
above therefore stands for a host-supplied policy requirement; this chapter does not invent a final
authorization DSL. See [Authentication and Principals](../03-runtimes/04-authentication-and-principals.md)
for the settled authentication path.

## The operation execution envelope

An operation currently has these distinct extension points:

| Surface               | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------ |
| `input`               | Describe and validate admissible values.                                       |
| `requires`            | Gate whether execution may be attempted in the current context.                |
| named `contracts.pre` | Portable input conditions compiled to reflected Model Expression metadata.     |
| `contract(...)`       | Explicit opaque server-only pre/post checks.                                   |
| `concerns`            | Wrap execution with cross-cutting behavior such as rate limiting or telemetry. |
| success effects       | Emit events or run follow-up work only after a successful result.              |

The runtime order is input validation, requirements, portable preconditions, opaque contract
checks around the body, then success effects. For `operation.atomic(...)`, requirements, portable
conditions, opaque pre/body/post checks, and their Data Graph work share the declared transaction.
Cache invalidation and host hooks happen after successful execution.

`concerns: [...]` is the current middleware seam: a concern receives the next computation and can
act before it, after it, or around a failure. A success effect is different. The operation body
returns it alongside its value, and the runtime executes it only after the body and postconditions
succeed:

```ts
return app.effects.withEffects(created, [
  app.effects.event({
    type: 'todo_list.created',
    listId: created.id,
  }),
]);
```

`concerns`, success-effect intents, and imperative hooks such as `onSuccess` exist, but are the most
transitional part of this surface. Prefer semantic inputs, requirements, contracts, and emitted
events where they fit; use custom middleware and hooks narrowly until their graph-native form is
settled.

## Keep the two failures distinct

```ts
const invalid = await TodoList.rename({
  list: 'A',
  name: 'Archive',
});

if (!invalid.ok && invalid.kind === 'input_invalid') {
  console.error(invalid.issues[0]?.message);
}

const duplicate = await TodoList.create({
  id: crypto.randomUUID(),
  name: 'Research',
});

if (
  !duplicate.ok &&
  duplicate.kind === 'failed' &&
  duplicate.failure.reason === 'todo_list_name_taken'
) {
  console.error(duplicate.message);
}
```

`input_invalid` means the value was outside the declared input set and the operation did not
start. `failed` means execution began and produced an expected domain answer.

## A precondition is not a uniqueness invariant

Two concurrent `create` operations can both observe that a name is available. A precondition makes
the dynamic rule and its failure explicit, but it does not make the read and insert atomic by
itself.

The same distinction applies to Relation state. A conditional Relationship Command such as
`assign(next, { ifCurrent: previous })` can ask its provider to compare and change one edge
atomically because that guard is part of the structural command. An Operation precondition that
resolves a Ref and then runs several independent Commands has not acquired that guarantee merely
because it ran first.

When several reads and mutations jointly define valid state, put them in an
`operation.atomic(...)` body. The Operation runner opens or reuses the compositional transaction
on a runtime that provides it; PostgreSQL currently does, while Supabase/PostgREST does not turn
several requests into one rollback unit. See [Relations](03-relations.md) and
[Runtime Composition and Capabilities](../03-runtimes/01-runtime-composition-and-capabilities.md).

True uniqueness wants to live as a declarative Entity invariant interpreted by storage. Ontahí
does not yet expose that settled model. Until it does, the database constraint remains the final
authority, and the operation must translate its violation into the same expected domain failure.

The remaining invocation shapes keep their existing meaning:

- `rejected`: the runtime refused the invocation before the operation body.
- `errored`: an unexpected defect or runtime failure occurred.

Use `app.operation.fail(...)` inside `run` when an expected domain answer only becomes known during
the body. Keep authorization pressure in `requires` while its policy API matures.
