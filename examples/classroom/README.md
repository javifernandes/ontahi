# Classroom

This headless example is the executable Relations lifecycle proof for Plan 139. It deliberately
keeps two concepts separate:

- `Student.currentCourse` is a direct nullable Relation. Reassignment uses an atomic `ifCurrent`
  precondition and can either fail or explicitly return `not-applied` on a stale observation.
- `Student.transfer(...)` is a Domain Operation that coordinates that Relation transition with the
  previous and next Course capacity changes in one PostgreSQL transaction.
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

The Operation enters `app.graph.transaction(effect)`, resolves those schema-native Refs through
the transaction-scoped UnitOfWork, executes the conditional Relationship Command with `.run()`,
and updates both capacities through Entity Commands. PostgreSQL runs every read and write through
the same checked-out connection. A known-full destination is rejected before the Relationship
Command. A later capacity compare-and-set mismatch returns a domain failure and rolls the complete
transition back. A stale `previousCourse` is translated from the portable Relationship Command
outcome into `student_course_changed`, without leaking a provider error through the Domain
Operation contract.

The capacity counter is intentionally an application invariant, not Relation metadata or an
aggregate Relation constraint. The example rejects stale evidence rather than adding an implicit
retry policy, and it does not claim that a stored counter is equivalent to deriving membership.

The package still has no UI, HTTP transport, or remote Command bridge. Enrollment is not
automatically reflected as an Association Entity merely because it has required participant Refs;
tooling must keep its role `unknown` until Ontahí has explicit classification evidence.

Inside the lifecycle Operations, the schema-native `enrollment` input is a portable Ref hydrated
with `resolve()`. Updates still go through the Entity's `commands` surface: input Ref hydration does
not currently attach every Entity mutation method.
