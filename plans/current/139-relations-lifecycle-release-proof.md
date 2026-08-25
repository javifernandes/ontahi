# 139. Relations Lifecycle Release Proof

Status: current

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
   [139a. Composable Data Graph Transactions](../done/139a-composable-data-graph-transactions.md).
3. Lift that provider primitive into an isolated, transaction-scoped UnitOfWork so bound reads and
   explicit Command executions route contextually without an application-visible `tx` parameter.
   Completed in
   [139b. Transaction-Scoped Unit Of Work](../done/139b-transaction-scoped-unit-of-work.md).
4. Add ergonomic Reaction matcher/intent factories and application/runtime registration under
   Plan 135 without attaching callbacks to Relation metadata. Completed through
   [135b. Declarative Reaction Authoring And Registration](../done/135b-declarative-reaction-authoring-and-registration.md).
5. Transport precondition conflicts as structured outcomes, then offer an explicit
   `onMismatch: 'skip'` mode whose `not-applied` outcome remains observable. Keep conflict as the
   default and do not collapse skipped, idempotent, and applied transitions into one empty delta.
   Completed through
   [136g. Portable Relationship Command Outcomes](../done/136g-portable-relationship-command-outcomes.md).
6. Add a small executable `classroom` example centered on School, Course, Student, Teacher and an
   Enrollment Association Entity. Begin with schema and behavioral scenarios; add UI only where it
   proves a framework affordance.
7. Keep Todo Express as the simple compatibility proof rather than forcing complex lifecycle rules
   into it.
8. Move the developer documentation source from `ontahi-library` into this repository if that
   ownership decision remains current, preserving provenance and replacing the old source with a
   relocation notice rather than a duplicate canonical copy.
9. Teach the complete lifecycle with concrete Classroom examples and verify all public APIs against
   packed artifacts.
10. Run the release rehearsal and merge the generated release PR only after Todo, Classroom and the
    developer docs agree with the shipped surface.

## Acceptance Checklist

- [x] Required coordinated mutation and post-application Reaction semantics are separately documented and executable.
- [ ] Classroom demonstrates conditional reassignment, unlink Reaction, and stateful Enrollment lifecycle.
- [ ] Todo remains small and passes as a packaged consumer.
- [ ] Developer docs live at one canonical source and match the candidate release.
- [ ] Package, artifact, example and release dry-run verification pass.
