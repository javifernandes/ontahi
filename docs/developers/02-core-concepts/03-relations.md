# Relations

A \concept{Relation} names how Entities are connected. The most common relation is declared where
the connection actually lives: in the referencing field.

```ts
export const TodoList = entity({
  name: 'TodoList',
  fields: {
    id: f.id(),
    name: f.nonEmptyString({ trim: true }),
  },
});

export const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: f.id(),
    list: f.ref(TodoList),
    title: f.nonEmptyString({ trim: true }),
    completed: f.boolean(),
  },
});
```

`TodoItem.list` is both a field whose value is a TodoList \concept{Ref} and the `belongsTo` relation
from TodoItem to TodoList. There is no separate `listId` field and no second declaration that restores
its lost meaning.

The physical representation belongs to storage. A relational adapter may conventionally store
`TodoItem.list` in `todo_items.list_id`; the Entity, its operations, and its clients continue to speak in
Refs.

## Use the reference without loading the relation

```ts
const research = TodoList.refById('list-research');

await TodoItem.insert({
  id: 'todo-map-runtime',
  list: research,
  title: 'Map the runtime',
  completed: false,
}).run();

const todos = await TodoItem.where(todo => todo.list.eq(research)).run();
```

The `list` value identifies one TodoList. Neither statement requires its current fields. Ontahí
lowers the Ref only when the chosen runtime reaches its storage boundary.

A Ref is also a valid membership criterion for its own Entity:

```ts
const lists = await TodoList.where(research).run();
```

## Materialize the relation when the result needs it

Without an include, each TodoItem contains a Ref at `list`. An include materializes the target at that
same path:

```ts
const todosWithLists = await TodoItem.all()
  .include(todo => ({
    list: todo.list.select(list => ({
      id: list.id,
      name: list.name,
    })),
  }))
  .run();
```

For a required `f.ref`, `list` becomes the selected TodoList value. A
`f.nullable(f.ref(TodoList))` produces `TodoList | null` after inclusion.

## Navigate through the relation

The Ref-valued field is already a typed membership criterion. An ordinary Query can select the
TodoItems belonging to one list:

```ts
const items = await TodoItem.all()
  .where(todo => todo.list.eq(TodoList.refById('list-research')))
  .orderBy(todo => todo.title)
  .run();
```

The generated browser projection authors the same Query:

> [!MARGIN] **One graph language, two execution models.** Notice how closely the server and client
> code correspond. On the server, `.run()` executes the Query directly. In React, `useGraphQuery`
> observes that same Query through React's reactive lifecycle. Ontahí's Entity and Query vocabulary
> remains ubiquitous across the boundary; only the execution model changes.

```tsx
export const ItemsForList = ({ listId }: { listId: string }) => {
  const todos = useGraphQuery(
    TodoItem.all()
      .where(todo => todo.list.eq(TodoList.refById(listId)))
      .as(TodoItemRow),
  );

  return (
    <ul>
      {todos.data?.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
};
```

You do not need to invent a read-only Operation such as `fetchItemsForList` merely to wrap this
read; that would duplicate the Query as boilerplate. The Ref already authors the same semantic
membership, and the server's graph-read policy decides whether that field and operator are
remotely available.

Reify the behavior as an Operation only when the application needs a named server-owned contract:
authorization or other requirements, explicit failures, rate limiting or telemetry concerns,
secrets and Capabilities, coordination across effects, or a durable lifecycle. See
[Operations](07-operations.md), [Operation Contracts and Failures](08-operation-contracts-and-failures.md),
[Durable Operations](09-durable-operations.md), and
[Authentication and Principals](../03-runtimes/04-authentication-and-principals.md).

## Declare the inverse collection

A plural inverse is not stored as an Entity field. It points back through the field that owns the
references:

```ts
export const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    student: f.ref(Student),
    course: f.ref(Course),
    status: f.string(),
  },
});

// In Student's declaration
relations: () => ({
  enrollments: relation.inverse(Enrollment.fields.student),
}),
```

`Enrollment.fields.student` already supplies the related Entity, the reference value, and the join
evidence. The inverse declaration adds only the domain name and `hasMany` cardinality.

Reflection can still show the other endpoint when only one side was declared. It derives a
read-only inverse descriptor from the schema's Reference Field evidence, preserving the canonical
declaring Entity and Relation identity. That descriptor makes topology visible in Explorer, but it
does not invent a stable domain member name or executable verbs. Declare the inverse explicitly
when application code should be able to write `course.students.add(student)`.

## Change the connection as a Relation

Changing a connection is not an ordinary field update with the meaning removed. A
\concept{Relationship Command} preserves the structural intention:

```ts
const student = Student.refById('student-1');
const course = Course.refById('course-1');

const assign = student.course.assign(course);
const clear = student.course.clear();
```

The inverse direction authors the same canonical command:

```ts
course.students.add(student);
course.students.remove(student);
```

The verbs follow cardinality: use `assign` and `clear` for a to-one Relation, and `add` and `remove`
for a to-many Relation. They are not application-defined methods; Ontahí provides and validates
them from the Relation declaration. Relation names, available verbs, and participant Ref types are
all checked statically: `student.course.add(...)` and `course.students.assign(...)` do not type-check.

The methods are a local facade over a portable Ref. They are non-enumerable and do not become part
of its serialized identity; crossing a process boundary still carries only the Entity name and
locator. The lower-level `relationship(Entity, relationName, subject)` factory remains available to
framework integrations, but ordinary application code starts from the bound Ref.

Constructing the command is pure. A runtime-bound command gains an explicit, non-enumerable
`.run()` method, so execution can discover the current runtime without changing the portable
command envelope:

```ts
const result = yield * student.course.assign(course).run();
```

Assigning through `Student.course` and adding through `Course.students` are two domain readings of
one link. Ontahí normalizes both directions to the identity of the Reference Field that owns the
connection. Clearing a required relation is rejected before mutation.

Provider and remote runtimes return an explicit \concept{Relationship Command Result}. An applied
command carries a \concept{Relationship Delta}: only the links actually added or removed. An
idempotent assignment is still applied and carries empty arrays instead of claiming that a fact
changed. A deliberately skipped conditional command is different: it is `not-applied` and has no
delta.

```ts
type RelationshipCommandResult =
  | {
      status: 'applied';
      delta: { added: RelationshipFact[]; removed: RelationshipFact[] };
    }
  | {
      status: 'not-applied';
      diagnostic: RelationshipCommandDiagnostic;
    };
```

The exact delta can drive cache reconciliation, telemetry, Reactions, or an audit trail without
reconstructing intent from an Entity snapshot. Always narrow `status` before reading it.

Application-bound execution enriches an applied result with its Applied Mutation Outcome and
Reaction evidence, so its delta lives at `result.outcome.delta`. A skipped application-bound
command retains the same `{ status: 'not-applied', diagnostic }` form and creates neither an
outcome nor Reactions.

## Make a to-one transition conditional

An assignment may require the currently related Entity to match evidence already held by the
caller:

```ts
const result =
  yield *
  student.course
    .assign(nextCourse, {
      ifCurrent: previousCourse,
      onMismatch: 'skip',
    })
    .run();

if (result.status === 'not-applied') {
  result.diagnostic.reason; // 'relationship_precondition_failed'
}
```

The provider compares and changes the edge atomically. Omitting `onMismatch`, or setting it to
`'fail'`, keeps mismatch in the Effect failure channel. `'skip'` is explicit because stale evidence
must not become indistinguishable from an applied idempotent command.

## Declare portable participant eligibility

A Relation may restrict which participants can be linked with the same portable predicate
vocabulary used by Selections:

```ts
tags: relation.manyToMany(Tag, {
  constraints: (): readonly RelationConstraint[] => [
    relationConstraint.source(
      TodoItem,
      todo => todo.completed.eq(false),
      {
        code: 'completed_todo_cannot_be_tagged',
        message: 'Completed todos cannot be tagged.',
      },
    ),
  ],
}),
```

The factory callback runs while constructing the schema and becomes a JSON-safe Selection AST; no
arbitrary executable callback is stored on the Relation or transported to a server. `source` and
`target` are relative to the declared endpoint. Forward and inverse commands normalize them to the
same canonical participants.

In-memory, PostgreSQL, and Supabase enforce participant constraints authoritatively at mutation
time. Selection-valued many-to-many `link` is all-or-nothing: one ineligible participant rejects
the whole affected set. `unlink` bypasses link eligibility so an application can repair a fact
whose participants no longer qualify.

A direct to-many Relation can also bound its current population with a stored numeric Field on the
declaring endpoint:

```ts
students: relation.hasMany(StudentRef, {
  via: 'currentCourse',
  constraints: [
    relationConstraint.countAtMost('capacity', {
      code: 'course_full',
      message: 'Course has no available seats.',
    }),
  ],
}),
```

The reflected contract says `enforcement: 'authority-serialized'`. An addition is checked against
the prospective count, while an idempotent link is an empty delta and removal remains available to
repair already-invalid data. Forward `student.currentCourse.assign(course)` and inverse
`course.students.add(student)` normalize to the same canonical command and receive the same
rejection.

PostgreSQL automatically executes this constrained command in a transaction, locks the destination
endpoint, and evaluates the count from a fresh statement snapshot before applying the edge. This
prevents two concurrent callers from both taking the last slot. Supabase currently fails closed for
this requirement rather than weakening it to a PostgREST preflight. In-memory enforces the same
prospective rule but makes no concurrency claim. Client evaluation, when added, remains UX guidance
rather than authorization.

This is a structural Relation constraint, not yet a permanent Entity invariant: a generic Command
that lowers `Course.capacity` is not intercepted by this slice. A future `Entity.invariants`
surface must route every relevant mutation path through the same planner before making that broader
promise.

The command is structural behavior supplied by Ontahí. An application should not reimplement
referential checks, nullability, inverse normalization, or delta calculation in every Operation.
Use an Operation when assigning the relation also means approving enrollment, enforcing a domain
invariant, coordinating other mutations, requiring authority, or starting durable work.

## Coordinate required work; react after application

A structural command owns one edge mutation. Required multi-step consistency belongs in a Domain
Operation and an honest provider transaction. The Classroom example uses one atomic Operation for
its input participants and conditional transition, while `Course.students` owns the structural
capacity rule for every Relationship Command path:

```ts
const students = app.graph.defineEntity(self);

transfer: operation.atomic({
  input: graphSchema.object({
    student: graphSchema.existingRef(self),
    previousCourse: graphSchema.existingRef(Course),
    nextCourse: graphSchema.existingRef(Course),
  }),
  *run({ student, previousCourse, nextCourse }) {
    const relationship = yield* students
      .refById(student.id)
      .currentCourse.assign(nextCourse.ref, {
        ifCurrent: previousCourse.ref,
        onMismatch: 'skip',
      })
      .run();

    return relationship;
  },
}),
```

`operation.atomic(...)` lets the Operation runner create the isolated transaction UnitOfWork before
it materializes the required participants. Bound Queries and explicit Command `.run()` calls
discover its connection-scoped runtime; application code receives no `tx` parameter. A typed
failure or defect rolls the whole effect back. PostgreSQL currently supplies this compositional
capability. Supabase/PostgREST keeps each Relationship Command RPC atomic but does not pretend that
several HTTP requests share rollback. It also does not advertise the authority-serialized aggregate
capability required by `countAtMost`; that command fails before RPC execution.

Follow-up behavior that is not required to validate the primary mutation is a \concept{Reaction},
registered on the application rather than attached as a Relation callback:

```ts
reactions: () => [
  reaction
    .relationship(Course, 'students')
    .removed({ id: 'course.students.removed', delivery: 'inline' })
    .emit(outcome => ({
      type: 'StudentRemovedFromCourse',
      student: outcome.command.source,
      course: outcome.command.target,
    })),
],
```

Only an applied command creates the Applied Mutation Outcome matched by this rule. Inside a
transaction, Ontahí queues the Reaction until the provider commits and discards it on rollback.
After commit, a failed follow-up remains Reaction evidence; it cannot retroactively roll back the
primary mutation. See the complete
[`Classroom application`](../../../examples/classroom/src/application.ts) and
[`Student.transfer`](../../../examples/classroom/src/classroom.ts) proof.

## Declare a direct many-to-many Relation

A join table that only stores topology does not need to become a public Entity. Declare the
many-to-many Relation directly:

```ts
export const TodoItem = entity({
  name: 'TodoItem',
  fields: todoItemFields,
  relations: {
    tags: relation.manyToMany(Tag),
  },
});

mapRelation(TodoItem, 'tags', {
  type: 'many-to-many',
  from: 'todo_items.id',
  through: {
    table: 'todo_tags',
    fromColumn: 'todo_id',
    toColumn: 'tag_id',
  },
  to: 'tags.id',
});
```

Both endpoints may be Refs or Selections. Applying one command to N TodoItems and M Tags is the
ordinary Cartesian relation mutation, not a hand-written batch protocol:

```ts
const selectedTodos = TodoItem.selection(todo => todo.completed.eq(false));
const urgentTags = Tag.selection(tag => tag.name.eq('Urgent'));

const addUrgent = relationshipSet(TodoItem, 'tags', selectedTodos).add(urgentTags);
const removeUrgent = relationshipSet(TodoItem, 'tags', selectedTodos).remove(urgentTags);
```

The runtime resolves both Selections, validates explicit Refs exactly once, applies the edge
mutation atomically, and returns the exact delta. An empty filtered Selection is a valid no-op; a
missing explicit Ref is a cardinality failure and must not leave partial associations.

Selections are essential in this example because each endpoint describes a reusable set rather
than one identity. See [Selections](04-selections.md) for their membership and composition model.

## Promote an association when it has a life

An association remains an ordinary Entity when it has attributes, identity, behavior, or lifecycle
of its own:

```ts
export const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    id: f.id(),
    student: f.ref(Student),
    course: f.ref(Course),
    startedAt: f.datetime(),
    status: f.string(),
    approvedBy: f.nullable(f.ref(User)),
  },
});
```

Ontahí does not require a public `AssociationEntity` subtype. Construction already requires the
participant Refs because they are required fields; deletion extinguishes that association. The
framework supplies ordinary Entity construction, deletion, referential interpretation, and applied
mutation outcomes. The application adds only the lifecycle and invariants that make Enrollment a
domain concept.

Tooling does not infer that role merely from required Ref fields. An Entity with two required Refs
may still be an ordinary domain record. Explorer reports explicit graph-relation ownership when
the model provides it and otherwise keeps association classification `unknown`; identity,
attributes, Operations, policy, and lifecycle remain ordinary Entity semantics.

Creating and deleting the Entity are therefore another way to establish and extinguish a
relationship, while preserving that this association has identity and state:

```ts
const student = Student.refById('student-1');
const course = Course.refById('course-1');

await Enrollment.insert({
  id: 'enrollment-1',
  student,
  course,
  startedAt: new Date(),
  status: 'active',
  approvedBy: null,
}).run();

await Enrollment.selection(enrollment => enrollment.id.eq('enrollment-1'))
  .delete()
  .run();
```

Deletion uses a Selection because Entity Commands always state their target set explicitly; this
one selects exactly the association identity. The next chapter develops
[Selections](04-selections.md) as the reusable membership language behind that target.

Both a direct `Student.course` edge and an `Enrollment(student, course)` instance may expose the
same connection for traversal. Their mutation outcomes remain intentionally different. A direct
Relation reports links added or removed; creating or deleting `Enrollment` reports an Entity
lifecycle change, so its attributes, reactions, policy, and history are not erased.

This is the boundary:

- `TodoItem.tags` is topology, so it remains a direct many-to-many Relation;
- `Enrollment` has state and lifecycle, so it is an Entity;
- an Operation coordinates either form when structural mutation alone is not the whole intention.

## Break declaration cycles explicitly

When a reference field must target an Entity declared later, give Ontahí its semantic contract:

```ts
const StudentRef = entity.ref('Student', { fields: studentFields });

export const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    student: f.ref(StudentRef),
    course: f.ref(Course),
    status: f.string(),
  },
});
```

`ontahi()` resolves deferred references against the complete Entity catalog before storage or
operations are bound. Prefer the direct Entity when declaration order already permits it.

## Keep explicit relations for exceptional mappings

The lower-level declarations remain available for legacy scalar fields, composite physical keys,
and mappings that cannot be derived from a reference field:

```ts
fields: {
  legacyListId: f.id(),
},
relations: {
  list: relation.belongsTo(TodoList, { via: 'legacyListId' }),
},
```

Use `f.ref` for the ordinary semantic case. Use explicit `belongsTo` and `hasMany` when the
exception itself is information the model needs to preserve.
