# 139c. Executable Classroom Lifecycle Proof

Status: done

Canonical ID: `ontahi://plans/139c-executable-classroom-lifecycle-proof`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

## Summary

Add a small headless `classroom` example that makes the current Relations lifecycle executable and
teachable without introducing a UI or a remote Entity Command bridge. The example contrasts a
direct current-placement Relation with an Enrollment Entity whose attributes and state give it an
independent lifecycle.

## Scope

1. Model School, Course, Teacher, Student, and Enrollment with the existing unified Entity API.
2. Prove conditional Student course reassignment with both the default conflict and explicit
   `onMismatch: 'skip'` result.
3. Register an application Reaction for inverse `Course.students.remove(...)` and expose its Event
   evidence after the Relation mutation is applied.
4. Model Enrollment as an ordinary Entity with participant Refs, identity, attributes, and named
   pending/active/cancelled lifecycle Operations.
5. Keep the example runnable as a private workspace package with semantic tests and a concise
   developer-facing README.

## Non-Goals

1. No Classroom UI, HTTP server, Explorer integration, or generated client.
2. No generic remote Entity Command bridge.
3. No PostgreSQL/Supabase transaction proof or coordinated capacity update.
4. No new Core API and no callback attached to Relation metadata.
5. No inferred Association Entity role; Enrollment remains an ordinary Entity until explicit
   classification metadata exists.

## Acceptance Checklist

- [x] A successful conditional reassignment returns an exact applied delta.
- [x] A stale conditional reassignment fails by default and can explicitly return `not-applied`.
- [x] Inverse unlink emits one registered Reaction Event only after an applied mutation.
- [x] Enrollment create, activate, and cancel preserve its participants and domain attributes.
- [x] The example explains why direct Relation and Association Entity lifecycle are distinct.
- [x] Focused tests, example typecheck, lint, formatting, and proportional workspace checks pass.

## Split Point

Stop when the in-memory headless proof is executable and documented. A provider-backed coordinated
course transfer, UI, developer-document migration, and remote Entity Command execution remain
separate slices.

## Delivery

The private `@ontahi/example-classroom` workspace package now defines School, Teacher, Course,
Student, and Enrollment with the unified Entity API. `Student.currentCourse` and its explicit
`Course.students` inverse prove direct conditional Relation authoring. The executable scenarios
preserve exact applied deltas, default conflict behavior, and the explicit portable `not-applied`
skip result.

One application-registered Reaction observes inverse unlink and emits portable participant Refs
after an applied mutation. Enrollment remains an ordinary Entity with its own id, participant Refs,
credits, timestamps, and pending/active/cancelled state. Its Operations resolve the schema-native
input Ref through the UnitOfWork and use Entity commands for state changes; no association role is
inferred from required Ref fields.

No public package API changed, so this documentation/private-example slice requires no Changeset.

## Verification

1. The Classroom suite passed all three semantic lifecycle scenarios.
2. The complete example sweep passed: Classroom 3 tests and Todo Express 29 tests. Todo's OAuth
   tests required the existing localhost-capable execution boundary outside the filesystem sandbox.
3. All ten packages and both examples passed typecheck.
4. Repository lint passed across all configured packages, applications, and examples.
5. Classroom built successfully and the repository-wide format check passed across 748 files.
