# Classroom

This headless example is the executable Relations lifecycle proof for Plan 139. It deliberately
keeps two concepts separate:

- `Student.currentCourse` is a direct nullable Relation. Reassignment uses an atomic `ifCurrent`
  precondition and can either fail or explicitly return `not-applied` on a stale observation.
- `Course.capacity` is stored, while `occupiedSeats` and `availableSeats` are virtual derived Fields
  over `Course.students`. The same Model Expression metadata runs in memory and PostgreSQL.
- `Course.students` declares `countAtMost('capacity')`; direct membership additions are checked
  against prospective state and PostgreSQL serializes contenders for the same Course.
- `Student.transfer(...)` is an atomic Domain Operation that coordinates the conditional Relation
  transition. Its declaration states the guarantee while the active runtime decides whether it can
  provide the boundary.
- `Enrollment` is an ordinary Entity because participation has its own id, status, timestamps, and
  credits. Its `enroll`, `activate`, and `cancel` Operations express that domain lifecycle.

`Course.students` is the inverse of `Student.currentCourse`. Removing through that inverse executes
the same structural unlink and an application-registered Reaction emits
`StudentRemovedFromCourse` after the mutation is applied. The Reaction is application behavior, not
callback metadata attached to the Relation.

Run the proof from the repository root:

```sh
pnpm --filter @ontahi/example-classroom test
```

Run the provider-backed transfer proof against the example's isolated PostgreSQL service:

```sh
pnpm --filter @ontahi/example-classroom db:start
pnpm --filter @ontahi/example-classroom test:postgres
pnpm --filter @ontahi/example-classroom db:stop
```

Application callers use portable Refs and do not receive a transaction runtime:

```ts
await classroom.Student.transfer({
  student: Student.refById('student-1'),
  previousCourse: Course.refById('course-1'),
  nextCourse: Course.refById('course-2'),
});
```

The Operation is declared with `operation.atomic(...)`; its body contains no transaction wrapper
or provider fallback. Its direct `*run(...)` body is interpreted as an Effect program, so sequential
Commands and typed failures keep the same transaction and UnitOfWork without an explicit
`Effect.gen(function* () { ... })` wrapper. Its inputs use `graphSchema.existingRef(...)`: callers
still send portable Refs, while the body receives authorized Student and Course records directly,
each with a non-enumerable `.ref` identity. The ordinary Operation runner derives the
`data-graph.atomicity` requirement and starts or reuses the active runtime's transaction before
materializing those participants through the transaction-scoped UnitOfWork. PostgreSQL runs every
read and write through the same checked-out connection. The named `differentCourses` precondition
is compiled into portable Model Expression metadata shared by server and generated clients; equal
previous and next Courses therefore return `operation_condition_rejected` before the body runs. A
A full destination is rejected by the Relationship Command itself with the reflected
`course_full` descriptor. A stale `previousCourse` is translated from the portable Relationship
Command outcome into `student_course_changed`.

There is no manually synchronized capacity counter. Migration `002` reconstructs stored `capacity`
from legacy `available_seats + current students`, validates it, and drops `available_seats`.
`occupiedSeats = students.count()` and `availableSeats = capacity - students.count()` are declared
once on Course. The same Relation count drives `countAtMost('capacity')`. PostgreSQL checks it after
locking the destination Course and from a fresh statement snapshot, so concurrent last-seat
admissions cannot both commit. The slice adds no implicit retry policy, Supabase support, or
permanent Entity invariant: a generic write that lowers `capacity` is still outside this structural
Relationship Command boundary.

The package still has no UI, HTTP transport, or remote Command bridge. Enrollment is not
automatically reflected as an Association Entity merely because it has required participant Refs;
tooling must keep its role `unknown` until Ontahí has explicit classification evidence.

Inside the lifecycle Operations, the schema-native `enrollment` input is a portable Ref hydrated
with `resolve()`. Updates still go through the Entity's `commands` surface: input Ref hydration does
not currently attach every Entity mutation method.
