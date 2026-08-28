# 139d. PostgreSQL Classroom Transfer

Status: done

Canonical ID: `ontahi://plans/139d-postgres-classroom-transfer`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

## Summary

Turn the headless Classroom model into one provider-backed coordination proof. A Student transfer
conditionally replaces `currentCourse` and adjusts the previous and next Course capacities inside
`app.graph.transaction(effect)`, using schema-native input Refs and context-bound Commands without
an application-visible transaction runtime parameter.

## Risk To Prove

The transaction and UnitOfWork primitives already have focused PostgreSQL coverage, while the
Classroom example currently proves each lifecycle concept independently in memory. The missing
application-level evidence is that an ordinary Domain Operation can compose a Relationship Command,
authorized Ref reads, and Entity Commands on one checked-out connection, and that a domain failure
after the edge change rolls the entire transition back.

## Scope

1. Add available-seat state to Course and a typed Student transfer Domain Operation.
2. Resolve Student and Course input Refs through the transaction-scoped UnitOfWork.
3. Apply the conditional direct Relation transition and capacity updates through bound `.run()`
   methods discovered from context.
4. Reject same-Course and known-full destinations before attempting the Relation transition, then
   use stale capacity evidence to prove PostgreSQL rollback restores every row after a tentative
   transition.
5. Guard capacity writes with the values read by the Operation so a stale counter fails the whole
   transaction instead of silently overwriting it.
6. Add a conventional PostgreSQL migration, local Docker configuration, and real integration tests
   to the private Classroom package.

## Non-Goals

1. No generic remote Entity Command or Operation bridge.
2. No Classroom UI, HTTP host, Explorer mutation affordance, or generated client.
3. No Supabase compositional transaction emulation.
4. No aggregate Relation constraint or claim that a counter is equivalent to derived membership.
5. No nested transactions, retries, isolation-level DSL, or new Core/PostgreSQL public API.

## Acceptance Checklist

- [x] The public Operation spelling is `Student.transfer(...)`; application code receives no `tx`.
- [x] A successful PostgreSQL transfer commits the Relation delta and both capacity changes.
- [x] Equal previous and next Courses fail explicitly without changing state.
- [x] A full destination fails before the Operation attempts its Relation transition.
- [x] A stale current Course becomes an explicit domain failure without provider details leaking.
- [x] Stale capacity evidence causes an explicit domain failure and rollback.
- [x] Existing in-memory Classroom scenarios remain green.
- [x] Focused integration tests, example typecheck/build/lint, workspace checks, and format pass.

## Split Point

Stop after one honest PostgreSQL application proof. Remote execution, aggregate eligibility,
Supabase, UI, and generalized transaction authoring remain later work.

Review of the executable example extracted
[142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md).
That plan owns reflected atomic Operation requirements, conventional existing-Ref resolution,
portable pre/postconditions, permanent aggregate invariants, derived graph values, advisory client
evaluation, and topology-transparent runtime planning. Plan 139d retains the explicit coordination
code as evidence of the ergonomics and model semantics those slices should replace.

## Delivery

`Course.availableSeats` and the provider-neutral `Student.transfer(...)` Domain Operation now make
the coordinated lifecycle executable. Its input declares Student, previous Course, and next Course
as schema-native Refs. The implementation enters `app.graph.transaction(effect)`, resolves those
Refs in the child UnitOfWork, executes the conditional `currentCourse` Relationship Command through
its contextual `.run()`, and compare-and-set updates both Course capacities through Entity Commands.

The Operation explicitly requests the portable `onMismatch: 'skip'` result and translates it into
the domain failure `student_course_changed`. Equal endpoints become `same_course`, and a known-full
destination is rejected before attempting the Relation change. An observed-capacity mismatch becomes
`course_capacity_changed` and rolls the whole PostgreSQL transaction back. The stale-capacity
integration case uses a database trigger owned only by the test to force a change between the
authorized read and guarded write, without adding a test hook or callback to production Relation
metadata.

The Classroom package now exposes one application factory shared by in-memory and PostgreSQL
runtimes, a conventional migration, an isolated Docker Compose service, and commands for starting,
resetting, stopping, and testing it. The package remains private and no public Ontahí package API
changed, so the delivery carries an empty Changeset rather than scheduling a package release.

## Verification

1. The real PostgreSQL integration suite passed all five transfer scenarios: commit, same-Course
   rejection, full-course rejection before Relation mutation, stale-current domain failure, and
   stale-capacity rollback.
2. Classroom's three existing in-memory lifecycle tests passed; Todo Express passed all 29 tests.
   Todo's localhost OAuth tests were rerun outside the filesystem sandbox after the sandboxed sweep
   timed out at its network boundary.
3. All ten packages and both examples passed typecheck and repository lint.
4. Classroom built successfully.
5. Repository formatting passed across 752 files.
