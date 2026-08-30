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
  - ontahi://plans/136e-postgres-relation-participant-eligibility
  - ontahi://plans/136f-supabase-relation-participant-eligibility
  - ontahi://plans/136g-portable-relationship-command-outcomes
  - ontahi://plans/136h-authority-serialized-relation-count-constraints
  - ontahi://plans/137-reflected-relation-affordances
  - ontahi://plans/137a-read-only-relation-explorer
  - ontahi://plans/139-relations-lifecycle-release-proof
  - ontahi://plans/139a-composable-data-graph-transactions
  - ontahi://plans/139b-transaction-scoped-unit-of-work
  - ontahi://plans/139c-executable-classroom-lifecycle-proof
  - ontahi://plans/139d-postgres-classroom-transfer
  - ontahi://plans/139e-relations-developer-documentation
  - ontahi://plans/139f-relations-lifecycle-release-rehearsal
  - ontahi://plans/142c-reflected-atomic-operation-execution
  - ontahi://plans/145-ordered-relations-and-sequence-commands
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

Structural command resolution may also recover omitted inverse field evidence from the schema. It
prefers an explicit `via`/target field, then an explicit direct storage mapping, then the source
field of one unique target `belongsTo` edge pointing back to the source Entity. A Reference Field
declares that `belongsTo` endpoint implicitly, while the compatibility DSL may declare it explicitly
over a scalar foreign-key field. This is schema reflection, not adapter inference. Multiple
candidate fields remain ambiguous and require an explicit declaration; constrained command
execution fails closed when that ambiguity prevents canonical matching.

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

When a Ref belongs to a runtime-bound application Entity, the produced Relationship Command also
has a non-enumerable `.run()` binding. The canonical enumerable command remains the same portable
value; `.run()` resolves the active Data Graph runtime only when explicitly invoked.

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
remains available when last-write-wins is intentional. The default mismatch remains a typed
failure. Callers that explicitly choose
`assign(nextCourse, { ifCurrent: previousCourse, onMismatch: 'skip' })` receive a portable
`not-applied` result instead. Applied results always retain an exact delta, so an idempotent empty
delta is distinguishable from a skipped stale transition. Provider-backed compare-and-set compilation
must preserve that atomic boundary before advertising support. PostgreSQL now lowers direct
Relationship Commands to one guarded statement that locks and resolves the source, verifies the
target and expected current edge, applies the change, and returns enough state to materialize the
exact delta. Portable participant eligibility is compiled into that same statement: PostgreSQL
locks the affected source and target rows, evaluates every constraint, and returns the first stable
rejection without applying the edge. Supabase preserves the same boundary through reusable
invoker-rights RPCs. A constrained link uses a version 2 payload so an older version 1 function
rejects it instead of ignoring unknown eligibility metadata. The adapter never degrades this into a
PostgREST read followed by update. Eligibility predicates use two-valued semantics at the mutation
boundary: a nullable value that does not positively satisfy a predicate is rejected rather than
passing through SQL `NULL`. Endpoint cardinality and a genuinely stale conditional transition are
reported before eligibility; a matching precondition does not mask the declared rejection. Grants
and RLS remain independent authorization boundaries.

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
4. storage either applies the edge atomically and returns `applied` with the exact Relationship
   Delta, or returns an explicitly requested `not-applied` precondition result;
5. only an applied result becomes an Applied Mutation Outcome;
6. application-registered Reactions may match that outcome and request semantic follow-up intents.

The graph boundary transports precondition and constraint rejections as structured JSON-safe
diagnostics. Constraint diagnostics preserve the declaration's version, stable code, safe message,
and scalar parameters. Precondition diagnostics expose canonical Relation identity without
revealing the actual current target. Protocol validation, policy denial, semantic rejection, and
infrastructure unavailability remain distinct response categories.

Only steps required for the primary invariant belong before edge application. Reactions occur after
an applied outcome and cannot imply rollback. A Data Graph transaction capability may coordinate
several required reads and mutations before that outcome. Its callback receives a transaction-
scoped runtime; using another runtime is outside the boundary. The provider callback is the
low-level contract. `app.graph.transaction(effect)` remains the explicit composition primitive;
Domain Operations that semantically guarantee this boundary use `operation.atomic({...})` and let
the runner establish or reuse it. Both paths create an isolated child
[[ontahi.model.unit-of-work|UnitOfWork]] and let bound Query and Command `.run()` methods discover
that runtime contextually. Success commits the whole effect, while failure or defect rolls it back
and restores the parent scope. Sequencing Effects without this capability still does not promise
one shared transaction, and adapters must not publish committed outcomes or run post-application
Reactions before the outer transaction commits.

Application-bound execution enforces that boundary: it queues registered Reaction interpretation
in the transaction child UnitOfWork, drains it after provider commit against the restored parent
runtime, and discards it on rollback. Provider Relationship Command contracts return an explicit
result envelope: the applied variant carries the exact Relationship Delta, while an explicitly
skipped stale precondition carries only its safe diagnostic.

Transaction is an optional execution capability, not Relation metadata or a portable Command.
PostgreSQL proves it with one checked-out connection and a transaction-scoped runtime that omits
the transaction method, making nested behavior unavailable in the first version. Remote runtimes,
Supabase/PostgREST, savepoints, retry policy, and distributed transactions do not inherit this
guarantee.

A Relation may own portable structural eligibility without owning an arbitrary callback. The first
constraint form applies the existing Selection predicate AST to a source or target participant of the
declared Relation and pairs it with a versioned rejection descriptor containing a stable code, safe
message, and JSON-safe scalar parameters. Static reflection preserves that contract. Authoritative
in-memory Relationship Command execution evaluates it before `link`; forward and inverse authoring
therefore enforce the same rule after normalization. Policy remains an independent authorization
boundary.

The first current-population form is
`relationConstraint.countAtMost(fieldName, rejection)`. It belongs to a direct to-many declaration,
uses a stored numeric Field on the declaring endpoint as its limit, and reflects
`enforcement: authority-serialized`. The canonical resolver maps an inverse `Course.students`
declaration onto the direct `Student.currentCourse` command, so forward assignment and inverse add
evaluate the same prospective count and rejection. Idempotent links do not revalidate; unlink stays
repair-safe for legacy-invalid data.

PostgreSQL automatically starts or reuses a transaction, locks the destination endpoint, and only
then evaluates and applies the command in a fresh statement snapshot. This prevents concurrent
last-slot additions on distinct source rows from both committing under `READ COMMITTED`. There is
no implicit retry policy. Supabase fails closed because its current RPC does not claim this
serialization capability; in-memory enforces prospective state without claiming concurrency.

This contract governs membership changed by Relationship Commands. It is not yet the permanent
Entity invariant proposed by Plan 142: generic writes that change the limit Field or a Reference
Field still require a unified invariant planner before `Entity.invariants` can honestly promise all
relevant mutation paths.

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
authoring thunk. PostgreSQL and Supabase now preserve the same all-or-nothing rule: they lock the
complete selected participant sets, evaluate constraints without filtering those sets, and guard
the Cartesian edge mutation with the resulting rejection evidence. The declared descriptor remains
structured adapter evidence. `unlink` bypasses link eligibility so an application can repair a fact
whose participants no longer satisfy the current rule.

For example, an association with its own state remains ordinary Entity lifecycle. The generated
client facade makes that lifecycle explicit without adding mutable state to the raw semantic
Entity:

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

const ClientEnrollment = defineClientEntity(Enrollment);

const createEnrollment = ClientEnrollment.create({
  student,
  course,
  startedAt: new Date(),
  status: 'active',
});

const enrollment = ClientEnrollment.refByStudentAndCourse(student, course);
const deleteEnrollment = enrollment.delete();

await Effect.runPromise(runtime.runEntityMutationCommand(createEnrollment));
await Effect.runPromise(runtime.runEntityMutationCommand(deleteEnrollment));
```

The participant Refs are required and type-checked by generic Entity construction. Creating the
instance establishes the reified association; deleting it extinguishes that association. No
application-authored lifecycle Operation is required for either structural action. Traversal may
observe the same relationship fact as a direct Relation, while Applied Outcomes preserve the
important distinction between changing a primitive edge and creating or deleting an Entity with its
own identity and lifecycle. Exact Entity Mutation Commands and Relationship Commands both have
versioned, default-deny remote paths; arbitrary provider or Selection Commands do not.

The executable `examples/classroom` proof keeps a direct Relation and an association-shaped Entity
side by side. `Student.currentCourse` represents the student's current placement and supports an
atomic conditional reassignment; `Course.students` is its named inverse. `Enrollment` instead owns
an id, Student and Course participant Refs, credits, timestamps, and a
pending/active/cancelled lifecycle. Its named lifecycle Operations resolve their schema-native input
Ref through the operation-scoped UnitOfWork and update through ordinary Entity commands. Required
participant Refs alone still do not classify it as an Association Entity in reflection.

The same example registers `Course.students.removed` behavior at `ontahi({ reactions })`. An inverse
unlink yields one canonical Relationship Command; only an applied command creates the outcome seen
by the Reaction and emits portable Student/Course Ref identities. This application registration is
deliberately separate from static Relation metadata and from any required transactional
coordination.

The PostgreSQL Classroom transfer keeps its participant resolution and conditional transition in
an `operation.atomic({...})` named `Student.transfer(...)`. The Domain Operation resolves portable
Student/Course input Refs in the runner-owned transaction UnitOfWork and applies
`currentCourse.assign(next, { ifCurrent: previous })`. `Course.students` owns the portable count
constraint, while `occupiedSeats` and `availableSeats` read the same canonical Relation aggregate.
No manual counter or Operation-local capacity preflight remains.

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

The canonical developer narrative for this complete lifecycle now lives in
[`docs/developers/02-core-concepts/03-relations.md`](../../../docs/developers/02-core-concepts/03-relations.md).
Todo remains the small direct-many-to-many proof; Classroom keeps conditional direct placement,
authority-serialized capacity enforcement, virtual capacity Fields, post-commit removal behavior,
and stateful Enrollment lifecycle in a separate focused example.

Plan 145 explores ordered to-many membership as a focused extension of this structural lifecycle.
Its working direction uses stable Ref anchors for insert, same-source move, and atomic cross-source
transfer; numeric UI indices and provider ranking tokens remain outside the portable contract. A
same-source reorder requires movement evidence beyond the current added/removed delta, while a
transfer must preserve the distinction between structural reparenting and Entity deletion. The
first implementation remains server-authoritative and leaves general replicated-sequence or CRDT
semantics to a later evidence-driven plan.

The generated `1.0.0-alpha.8` release candidate was rehearsed at its exact commit with all ten
package tarballs, a tarball-only Todo consumer, and Classroom's real PostgreSQL commit/rollback
suite. That candidate is the first release boundary teaching this lifecycle as one coherent model.
