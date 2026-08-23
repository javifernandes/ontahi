---
id: ontahi.model.relation
kind: concept
title: Relation
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.domain-topology-graphos
relatedPlans:
  - bookops://plans/71a-ontahi-relations-model-research
  - ontahi://plans/125-ontahi-reference-fields
  - ontahi://plans/131-ontahi-relationship-semantics
  - ontahi://plans/131a-relationship-command-delta-core-experiment
  - ontahi://plans/131b-conditional-to-one-transition
  - ontahi://plans/128c-relationship-command-wire-protocol
  - ontahi://plans/128d-relationship-command-policy-dispatcher
  - ontahi://plans/128e-relationship-command-runtime-routing
  - ontahi://plans/135-applied-mutation-outcomes-and-reactions
  - ontahi://plans/135a-selection-valued-many-to-many-core
  - ontahi://plans/136-relation-constraints-and-eligibility
  - ontahi://plans/136a-portable-participant-eligibility-core
  - ontahi://plans/136b-many-to-many-participant-eligibility
  - ontahi://plans/136c-postgres-direct-relation-compare-and-set
  - ontahi://plans/136d-supabase-direct-relation-compare-and-set
  - ontahi://plans/137-reflected-relation-affordances
  - ontahi://plans/137a-read-only-relation-explorer
migratedFrom: bookops://atlas/model/relation
sourceCommit: 67713696
---

A [[ontahi.model.relation|Relation]] names an edge between two
[[ontahi.model.entity|Entities]]. It is graph topology, not a storage join.

A reference stored by one Entity is declared as a Reference Field:

```ts
const TodoItem = entity({
  name: 'TodoItem',
  fields: {
    id: field.id(),
    list: field.ref(TodoList),
  },
});
```

This single declaration gives `TodoItem.list` two compatible roles. As Entity data it is a
[[ontahi.model.ref|Ref]] and can participate in a [[ontahi.model.selection|Selection]]. In a Query
`include`, it is the named `belongsTo` edge and materializes the referenced TodoList at the same
result path. Query clause proxies keep those roles unambiguous.

An inverse collection is not stored on the source Entity. It points back through a target Reference
Field:

```ts
relations: () => ({
  tagAssignments: relation.inverse(TodoTag.fields.todo),
});
```

The target field supplies the related Entity and join evidence. The inverse contributes the domain
name and `hasMany` cardinality. Deferred `entity.ref(...)` targets keep cyclic graphs independent of
declaration order.

Providers lower Reference Fields to their physical representation. A conventional relational
mapping may store `TodoItem.list` in `todo_items.list_id`; another provider can choose a different
shape. Explicit `belongsTo`, `hasMany`, and physical mappings remain compatibility and
advanced-mapping surfaces.

Relation-root navigation consumes the source [[ontahi.model.selection|Selection]] directly:

```ts
commands.relatedTo(list).orderBy(item => item.title);
```

The Selection already names its source Entity and membership. When one declared Relation connects
that Entity to the command Entity, Ontahí infers the edge in either direction. If several edges
connect the same pair, `{ through: 'relationName' }` makes that genuine topology choice explicit;
if none connect them, construction fails before the read reaches storage.

Plan 131 recommends a narrow B-lite distinction between Relation Definitions, concrete relationship
facts, structural Relationship Commands, resolved deltas, and Association Entities. A direct
Relation owns topology, cardinality, nullability, target compatibility, and the structural
`link/unlink` action pair. Authoring may present those actions as to-one `assign/clear` and inverse
to-many `add/remove`, but both directions preserve one canonical Relation identity.

Entity-bound Ref facades are the primary authoring surface:

```ts
student.course.assign(course);
course.students.add(student);
todo.tags.remove(tag);
```

The facade derives the available relation names, cardinality-specific verbs, and participant Ref
types from the Entity definition. These methods are local, non-enumerable bindings: serialized Refs
remain portable identity values with no methods or embedded Entity definition. The lower-level
`relationship(Entity, relationName, subject)` factory remains the primitive beneath the facade,
not the preferred application spelling.

Authoring forms need not erase meaningful preconditions. `student.course.clear()` means unlink any
current target, while `course.students.remove(student)` names the expected target and must not erase
a concurrent reassignment. They share canonical Relation identity and `unlink` action; the applied
Relationship Delta records the exact fact actually removed.

A forward to-one assignment can likewise preserve the target observed by its caller:

```ts
student.course.assign(nextCourse, { ifCurrent: previousCourse });
```

This is one conditional structural transition. The canonical command carries portable expected
current-target identity, and execution compares it inside the same mutation boundary that replaces
the edge. A mismatch is an observable conflict, not a successful no-op; unconditional `assign`
remains available when last-write-wins is intentional. Provider-backed compare-and-set compilation
must preserve that atomic boundary before advertising support. PostgreSQL now lowers direct
Relationship Commands to one guarded statement that locks and resolves the source, verifies the
target and expected current edge, applies the change, and returns enough state to materialize the
exact delta. The adapter fails closed for constrained Relations until eligibility can be compiled
into that same statement. Supabase preserves the same boundary through a reusable invoker-rights
RPC: it resolves endpoints, locks the source, compares expected current identity, changes the edge,
and returns prior-state evidence in one database transaction. The adapter never degrades this into
a PostgREST read followed by update. Grants and RLS remain independent authorization boundaries.

A Relation does not own arbitrary lifecycle hooks, domain failures, effects, authorization
coordination, or durability. Structural referential consistency, Selection resolution, cardinality,
and atomic edge application are generic graph/runtime responsibilities. Domain invariants and
coordinated behavior that cannot be expressed structurally remain with Domain Operations. When the
relationship has attributes, identity, lifecycle, history, independent policy or effects, more than
two roles, or participation in further Relations, model it as an ordinary Association Entity.

The mutation lifecycle keeps those responsibilities explicit:

1. cardinality-specific authoring produces a canonical Relationship Command;
2. policy establishes whether the caller may attempt it;
3. execution resolves participants and verifies structural preconditions and eligibility;
4. storage applies the edge change atomically and returns the exact Relationship Delta;
5. the runtime records an Applied Mutation Outcome;
6. application-registered Reactions may match that outcome and request semantic follow-up intents.

Only steps required for the primary invariant belong before edge application. Reactions occur after
an applied outcome and cannot imply rollback. A future compositional transaction capability may
coordinate several required mutations, but sequencing Effects in an Operation does not currently
promise one shared transaction.

A Relation may own portable structural eligibility without owning an arbitrary callback. The first
constraint form applies the existing Selection predicate AST to a source or target participant of the
declared Relation and pairs it with a versioned rejection descriptor containing a stable code, safe
message, and JSON-safe scalar parameters. Static reflection preserves that contract. Authoritative
in-memory Relationship Command execution evaluates it before `link`; forward and inverse authoring
therefore enforce the same rule after normalization. Policy remains an independent authorization
boundary. Aggregate limits, many-to-many batches, provider transactions, and advisory preflight
remain later Plan 136 work.

Application code authors that contract through the typed `relationConstraint.source(...)` and
`relationConstraint.target(...)` factories. The callback runs only while constructing the schema
and is immediately reduced to a portable Selection AST; no executable callback becomes Relation
metadata. Participant names remain relative to the declared Relation, independent of canonical
command or storage orientation.

Selection-valued many-to-many `link` evaluates every resolved source and target participant against
the applicable constraints before changing relationship facts. A mixed eligible/ineligible batch
is rejected as a whole; an empty filtered Selection remains a successful no-op. Eligibility guards
new links only, so `unlink` remains available even when a participant no longer satisfies the
current rule. Server Entity declarations may defer only constraint construction to resolve a source
Entity self-reference; materialized Relation metadata contains the portable AST, never that
authoring thunk. Provider-backed atomic enforcement and structured rejection transport remain Plan
136 work.

For example, an association with its own state remains ordinary Entity lifecycle. The current
low-level command authoring primitive makes that lifecycle explicit; its spelling is not a settled
high-level Entity facade:

```ts
const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    student: field.ref(Student),
    course: field.ref(Course),
    startedAt: field.date(),
    status: field.enum(['pending', 'active', 'completed'] as const),
  },
}).locators({
  refByStudentAndCourse: ['student', 'course'],
});

const createEnrollment = mutateEntity(Enrollment).create({
  student,
  course,
  startedAt: new Date(),
  status: 'active',
});

const enrollment = Enrollment.refByStudentAndCourse(student, course);
const deleteEnrollment = mutateEntity(Enrollment).delete(enrollment);

await Effect.runPromise(runtime.runEntityMutationCommand(createEnrollment));
await Effect.runPromise(runtime.runEntityMutationCommand(deleteEnrollment));
```

The participant Refs are required and type-checked by generic Entity construction. Creating the
instance establishes the reified association; deleting it extinguishes that association. No
application-authored lifecycle Operation is required for either structural action. Traversal may
observe the same relationship fact as a direct Relation, while Applied Outcomes preserve the
important distinction between changing a primitive edge and creating or deleting an Entity with its
own identity and lifecycle. Generic Entity Mutation Commands still lack a public remote bridge;
Relationship Commands already have a versioned, default-deny remote path.

An attribute-free binary many-to-many link is still a direct Relation even when relational storage
uses a join table. Both endpoints may be semantic Selections, so one Relationship Command naturally
expresses one-or-many sources crossed with one-or-many targets. Explicit Ref selections retain the
precondition that every named participant exists; arbitrary filtered Selections may resolve empty.
The join table and columns are provider mapping evidence and do not require a public join Entity.

Core proves this model with `manyToMany`, Selection-valued `add/remove`, Cartesian set deltas,
strict resolution of explicit Refs, and default-deny dispatch. PostgreSQL and Supabase provide
join-table mapping, traversal, and atomic mutation conformance; Todo uses the direct Relation rather
than exposing its physical join table as an Entity.

The canonical Relationship Command has a versioned JSON-safe graph-command envelope. A receiving
runtime resolves its Entity names and Reference Field identity against server-owned topology,
validates endpoint Refs and declared locators, and drops unknown envelope metadata. The wire form
contains no executable functions, provider mappings, authority claims, or Entity patch fallback.

Remote execution remains default-deny. A transport-neutral Graph Command dispatcher requires an
explicit policy for the canonical source Entity and Reference Field plus an allowed `link/unlink`
action before invoking storage. It accepts server-owned authority context as a future policy input,
but Plan 128d does not evaluate Principal roles or domain invariants; those remain integration work
for authorization and Domain Operations respectively.

Relationship Command execution is an optional runtime capability parallel to generic Entity Graph
Commands. The in-memory runtime implements it when given authoritative Entity definitions; the
remote runtime can encode the same canonical command through an injected transport and validate the
returned delta. Runtimes without the focused capability fail explicitly instead of lowering the
intent to an Entity patch.

Static Relation reflection is distinct from authority-dependent runtime affordances. A reflected
descriptor can expose canonical identity, direction, target Entity, cardinality, nullability, and
structural verbs without claiming that the current Principal may execute them. Explorer consumes
that contract read-only.

Reflection covers the whole structural edge, not only the Entity member on which it was declared.
When no equivalent explicit counterpart exists, Core derives an inverse endpoint identified by the
canonical declaring Entity and Relation name. That endpoint is navigable read-only topology, but it
does not invent a domain member name, structural verbs, or an executable Relation root. An explicit
counterpart remains the way to give the inverse endpoint a stable programmatic name and behavior.

A received Ref is portable Entity identity and can be rendered as a locator-aware link without
loading the related Entity. Materializing related attributes or to-many instances is a graph read:
Explorer delegates it to a host-provided Relation-root Query capability that must execute through
the configured runtime and graph-read policy. Explorer does not lower provider queries or duplicate
authorization. Association Entities remain ordinary Entities; tooling reports an explicit
association role only when metadata says so and otherwise classifies the role as `unknown`.
