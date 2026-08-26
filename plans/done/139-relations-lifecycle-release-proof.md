# 139. Relations Lifecycle Release Proof

Status: done

Canonical ID: `ontahi://plans/139-relations-lifecycle-release-proof`

## Summary

Close the current Relations cycle as one teachable release: finish provider mutation boundaries,
make required coordination and post-application Reactions explicit, prove the model in a richer
Classroom domain, migrate/update developer documentation, and rehearse the release boundary.

## Ordered Slices

1. Complete PostgreSQL/Supabase direct conditional transition parity and remaining atomic
   eligibility work under Plan 136. The participant-eligibility adapter proof is complete.
2. Define an honest compositional transaction capability; do not equate sequenced Operation
   Effects with shared rollback. Completed in
   [139a. Composable Data Graph Transactions](./139a-composable-data-graph-transactions.md).
3. Lift that provider primitive into an isolated, transaction-scoped UnitOfWork so bound reads and
   explicit Command executions route contextually without an application-visible `tx` parameter.
   Completed in
   [139b. Transaction-Scoped Unit Of Work](./139b-transaction-scoped-unit-of-work.md).
4. Add ergonomic Reaction matcher/intent factories and application/runtime registration under
   Plan 135 without attaching callbacks to Relation metadata. Completed through
   [135b. Declarative Reaction Authoring And Registration](./135b-declarative-reaction-authoring-and-registration.md).
5. Transport precondition conflicts as structured outcomes, then offer an explicit
   `onMismatch: 'skip'` mode whose `not-applied` outcome remains observable. Keep conflict as the
   default and do not collapse skipped, idempotent, and applied transitions into one empty delta.
   Completed through
   [136g. Portable Relationship Command Outcomes](./136g-portable-relationship-command-outcomes.md).
6. Add a small executable `classroom` example centered on School, Course, Student, Teacher and an
   Enrollment Association Entity. Begin with schema and behavioral scenarios; add UI only where it
   proves a framework affordance. The headless lifecycle proof is complete in
   [139c. Executable Classroom Lifecycle Proof](./139c-executable-classroom-lifecycle-proof.md).
   Its provider-backed coordinated transfer proof is complete in
   [139d. PostgreSQL Classroom Transfer](./139d-postgres-classroom-transfer.md).
7. Keep Todo Express as the simple compatibility proof rather than forcing complex lifecycle rules
   into it.
8. Move the developer documentation source from `ontahi-library` into this repository if that
   ownership decision remains current, preserving provenance and replacing the old source with a
   relocation notice rather than a duplicate canonical copy. Completed through
   [139e. Relations Developer Documentation](./139e-relations-developer-documentation.md).
9. Teach the complete lifecycle with concrete Classroom examples and verify all public APIs against
   packed artifacts.
10. Run the release rehearsal and leave the generated release PR ready for maintainer merge only
    after Todo, Classroom and the developer docs agree with the shipped surface. Completed through
    [139f. Relations Lifecycle Release Rehearsal](./139f-relations-lifecycle-release-rehearsal.md).

## Acceptance Checklist

- [x] Required coordinated mutation and post-application Reaction semantics are separately documented and executable.
- [x] Classroom demonstrates conditional reassignment, unlink Reaction, and stateful Enrollment lifecycle.
- [x] Classroom proves a Domain Operation can coordinate Relation and Entity Commands with PostgreSQL rollback.
- [x] Todo remains small and passes as a packaged consumer.
- [x] Developer docs live at one canonical source and match the candidate release.
- [x] Package, artifact, example and release dry-run verification pass.

## Delivery

The Relations cycle now has one coherent candidate release. Core reflects semantic direct and
inverse topology; cardinality-specific Relationship Commands preserve portable identity,
preconditions, participant constraints, explicit outcomes, and exact deltas; PostgreSQL and
Supabase enforce the supported atomic boundaries; application Reactions remain post-application
behavior; and contextual UnitOfWork plus PostgreSQL transactions coordinate the richer Classroom
case without an application-visible transaction runtime.

Todo remains the small end-to-end application and passed as a clean candidate-tarball consumer.
Classroom separately proves conditional placement, post-commit removal behavior, an ordinary
Enrollment Entity lifecycle, and coordinated PostgreSQL commit/rollback. The canonical developer
book now lives in this repository and the former `ontahi-library` location contains only its
relocation notice.

## Verification

Plan 139f rehearsed generated release PR #57 at exact commit `7fd23e6`: all ten packages built,
artifact clean-room verification passed, the immutable manifest and offline npm dry-run passed,
Todo passed codegen/types/tests/build from tarballs, and Classroom passed its headless and real
PostgreSQL suites. GitHub reports the release branch mergeable with all required checks successful.

## Remaining Follow-Ups

Closing this release proof does not close the broader Relations horizon:

1. Plan 136 retains aggregate/current-population constraints and advisory eligibility work that
   now overlaps the declarative invariant direction in Plan 142.
2. Plan 137 retains authority-dependent Relation affordances and Explorer mutation beyond the
   completed read-only slice.
3. Plan 128 retains the generic remote Entity Command bridge needed for broader headless and UI
   mutation surfaces.
4. Plan 142 owns characterization and evolution of existing Operation `contracts.pre/post`,
   reflected execution requirements, permanent invariants, and derived graph Fields.

Release PR #57 remains bot-owned and ready for the maintainer. Merging it, publishing through
trusted GitHub OIDC, and pinning downstream consumers are deliberately outside this plan PR.
