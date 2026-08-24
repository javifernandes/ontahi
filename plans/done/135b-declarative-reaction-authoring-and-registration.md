# 135b. Declarative Reaction Authoring And Registration

Status: done

Canonical ID: `ontahi://plans/135b-declarative-reaction-authoring-and-registration`

Parent: [135. Applied Mutation Outcomes And Reactions](./135-applied-mutation-outcomes-and-reactions.md)

Advances: [139. Relations Lifecycle Release Proof](../current/139-relations-lifecycle-release-proof.md)

## Summary

Lift the existing low-level Mutation Reaction runner into the application surface. Relationship
Reactions get typed authoring factories, register at `ontahi(...)`, and execute after the provider
has applied a bound Relationship Command. The application result exposes the applied outcome and
every Reaction execution without putting callbacks on Relation metadata.

```ts
const application = ontahi({
  storage,
  entities: [Course, Student],
  reactions: [
    reaction
      .relationship(Course, 'students')
      .removed({ id: 'course.students.removed', delivery: 'inline' })
      .emit(outcome => ({
        type: 'StudentRemovedFromCourse',
        student: outcome.command.source,
        course: outcome.command.target,
      })),
  ],
});

const result =
  yield *
  application.graph.entities.Course.refById('course-1')
    .students.remove(Student.refById('student-1'))
    .run();

result.status; // 'applied'
result.outcome.delta;
result.reactions;
```

## Risk To Prove

Providers currently and correctly return a `RelationshipDelta`. The Reaction engine separately
knows how to turn an applied command plus delta into an `AppliedMutationOutcome`, but its root path
re-executes the command. Application integration must consume the already-applied delta exactly
once, retain provider error typing for the root command, and interpret post-application failures as
observable Reaction evidence rather than reclassifying the parent mutation.

## Scope

1. Add typed Relation-aware factories for `added` and `removed` matchers.
2. Add semantic factories for Event, Operation Invocation, and follow-up Command intents.
3. Register Reactions at `ontahi({ reactions })`.
4. Let the existing runner consume an already-applied direct or many-to-many Relationship delta.
5. Return an application-level `{ status: 'applied', outcome, reactions }` result from bound
   Relationship Command `.run()` while provider runtime contracts remain delta-based.
6. Route Event emission and Operation Invocation through existing application/runtime capabilities.
7. Prove one Classroom unlink Reaction and contrast it with required transactional coordination.
8. Defer registered Reactions authored inside a compositional transaction until its provider commit;
   discard them on rollback and resolve follow-up Commands through the restored parent runtime.

## Non-Goals

1. Do not attach callbacks or Reaction declarations to Relation metadata.
2. Do not change PostgreSQL, Supabase, remote protocol, or provider `RelationshipDelta` contracts.
3. Do not add an outbox, durable retry, idempotency, or exactly-once claims.
4. Do not add Entity-mutation authoring factories in this slice.
5. Do not implement `onMismatch: 'skip'`; the applied-result envelope only prepares that union.
6. Do not build the Classroom example application or UI yet.

## Acceptance Checklist

- [x] Factories derive the same canonical matcher for forward and inverse Relation authoring.
- [x] Factory output hides low-level mutation/action tags from application declarations.
- [x] `ontahi({ reactions })` validates and registers Reaction declarations once.
- [x] A bound direct or many-to-many Relationship Command is applied exactly once.
- [x] `.run()` returns the exact applied outcome plus ordered Reaction execution evidence.
- [x] Root provider failures retain their existing typed Effect error channel.
- [x] A failed post-application intent leaves `status: 'applied'` and records Reaction failure.
- [x] Events and Operation Invocations use existing runtime/application interpreters.
- [x] Required coordinated changes remain explicit inside `app.graph.transaction(...)`.
- [x] Transaction-scoped Relationship outcomes do not trigger Reactions before commit or after
      rollback.
- [x] Portable Relationship Command serialization and low-level provider contracts are unchanged.
- [x] Focused tests, Core suite, typecheck, lint, formatting, and artifact checks pass.
- [x] Public surface changes include a Changeset and durable Relation/Reaction documentation.

## Split Point

Stop when application-registered Relationship Reactions are executable and observable. Structured
`not-applied` outcomes, Entity mutation registration, durable delivery infrastructure, Explorer
projection, and the full Classroom example remain later slices.

## Delivery

Core now exposes Relation-aware `added` and `removed` Reaction factories plus semantic Event,
Operation Invocation, and Command intent helpers. `ontahi({ reactions })` evaluates declarations
after Entity reference resolution, validates and materializes them once, and installs an
application-only Relationship Command executor. Provider runtimes, command serialization, and
remote protocols retain their `RelationshipDelta` contract.

Bound direct and many-to-many `.run()` calls return `{ status: 'applied', outcome, reactions }`.
The executor passes the provider's already-applied delta into the Reaction engine instead of
reissuing the root command. Follow-up Commands, Operation Invocations, and Events retain ordered
execution evidence; their failure does not rewrite the parent outcome.

The transaction child UnitOfWork owns a local post-commit queue. Registered Reactions are absent
inside its callback, run against the restored parent runtime only after provider commit, and are
discarded on rollback. This preserves the documented distinction between required coordinated
work and post-application behavior without claiming durable or exactly-once delivery.

## Verification

1. Focused Reaction factory, engine, adapter, and application integration suites passed: 4 files
   and 28 tests.
2. The complete Core suite passed: 84 files and 582 tests.
3. Core coverage passed at 88.90% statements and 89.21% lines; the new authoring factory reached
   100% line coverage and the contextual executor reached 88.23%.
4. Repository formatting, all-package lint, and all-package plus Todo typechecks passed.
5. Clean-room artifact build, pack, install, public type, and runtime checks passed for all ten
   packages.
6. The complete Todo suite passed outside the local-server sandbox: 5 files and 29 tests. The
   package sweep's Supabase RPC setup remained unavailable locally because no container runtime was
   running; its 48 non-container tests passed and CI retains the integration boundary.
