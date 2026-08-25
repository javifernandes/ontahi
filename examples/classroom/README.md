# Classroom

This headless example is the executable Relations lifecycle proof for Plan 139. It deliberately
keeps two concepts separate:

- `Student.currentCourse` is a direct nullable Relation. Reassignment uses an atomic `ifCurrent`
  precondition and can either fail or explicitly return `not-applied` on a stale observation.
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

The package has no UI, HTTP transport, or provider setup. That keeps the example focused on the
current in-process API. Enrollment is not automatically reflected as an Association Entity merely
because it has required participant Refs; tooling must keep its role `unknown` until Ontahí has
explicit classification evidence.

Inside the lifecycle Operations, the schema-native `enrollment` input is a portable Ref hydrated
with `resolve()`. Updates still go through the Entity's `commands` surface: input Ref hydration does
not currently attach every Entity mutation method.
