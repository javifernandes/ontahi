# 131a. Relationship Command And Delta Core Experiment

Status: done

Parent plan: [131. Ontahi Relationship Semantics](../done/131-ontahi-relationship-semantics.md)

Canonical ID: `ontahi://plans/131a-relationship-command-delta-core-experiment`

## Summary

Prove the B-lite relationship semantics with the smallest Core/local TDD slice: direct Reference
Relations expose structural commands that normalize forward and inverse authoring to one canonical
Relation identity, then the in-memory runtime reports the links actually added or removed.

The proof must preserve the boundary with Association Entity lifecycle. `Enrollment` remains an
ordinary Entity whose required construction input includes both participants; Relationship Command
must not absorb its attributes, status, Operations, or deletion behavior.

Association Entity construction and deletion are framework behavior, not application boilerplate.
Ontahi must derive the minimum construction contract from required participant Ref fields, validate
it before persistence, and treat ordinary Entity deletion as extinction of that association
instance. An application adds a Domain Operation only when domain invariants, authorization,
effects, custom failures, or coordination require one.

## Scope

1. Model `Student.course -> Course` as a nullable Reference Field with inverse `Course.students`.
2. Support direct `assign` and `clear` plus inverse `add` and `remove`.
3. Normalize both directions to one canonical Relation identity and `link/unlink` action while
   preserving any target precondition carried by the authoring form.
4. Resolve and expose a Relationship Delta containing facts actually added and removed.
5. Execute the command against the in-memory runtime only.
6. Model `Enrollment(student, course, startedAt, status)` as an ordinary Entity and prove the
   relationship primitive does not acquire Entity lifecycle options.
7. Prove Ontahi itself enforces required participant Refs on generic Entity construction and
   provides generic deletion; do not require an app-authored create/remove Operation for the
   structural lifecycle.

## Non-Goals

1. No HTTP, React, codegen, Explorer, agents, BookOps integration, or public remote transport.
2. No policy evaluation, authorization implementation, domain events, effects, retries, or durable
   execution.
3. No bulk Selection transitions, anonymous many-to-many storage, N-ary primitive Relation,
   `replace`, or partial-failure model.
4. No `AssociationEntity` superclass, relation lifecycle hooks, or automatic conversion between an
   Association Entity command and a primitive Relationship Command.
5. No broad redesign of Entity lifecycle beyond the minimum required-field construction contract
   needed to make Association Entity behavior framework-provided.

## Proposed Form

The exact fluent surface remains test-driven, but the semantic result should be equivalent to:

```ts
student.course.assign(course).build();
course.students.add(student).build();
```

```ts
{
  kind: 'relationship-command',
  action: 'assign',
  relation: {
    sourceEntityName: 'Student',
    fieldName: 'course',
  },
  source: Student.refById('student-1'),
  target: Course.refById('course-1'),
}
```

The inverse `add` must build the same canonical value. `clear` and inverse `remove` share the
canonical `unlink` action, but they cannot discard their semantic difference: `clear` removes any
current target while `remove` names the expected target and must not erase a concurrent
reassignment. Execution resolves an applied delta:

```ts
{
  added: [{ relation, source, target }],
  removed: [],
}
```

Reassigning a to-one Relation removes the previous fact and adds the next one. Repeating an already
applied command produces an empty delta.

## Execution Slices

- [x] Specify canonical Relation identity and Relationship Fact/Command/Delta types in focused tests.
- [x] Normalize forward `assign/clear` and inverse `add/remove` without erasing target preconditions.
- [x] Execute structural commands in the in-memory runtime with cardinality and nullability checks.
- [x] Cover no-op, reassignment, clear, and inverse removal deltas.
- [x] Add the `Enrollment` boundary proof without new Entity kinds or lifecycle hooks.
- [x] Prove generic Ontahi construction rejects a missing required participant and generic deletion
      extinguishes the Association Entity without app-authored lifecycle code.
- [x] Update the narrow Relation and Entity Atlas artifacts with the proven contract.
- [x] Add the required Changeset decision and run focused Core verification.

## Acceptance Checklist

- [x] Forward `assign` and inverse `add` produce the same canonical command.
- [x] Forward `clear` and inverse `remove` share canonical identity/action but preserve the inverse
      target precondition.
- [x] Assign, reassign, clear, and repeated no-op commands return exact applied deltas.
- [x] Clearing a required Relation fails before storage mutation.
- [x] Target and source Refs are validated against the Relation endpoints.
- [x] `Enrollment` construction requires both participants and remains ordinary Entity lifecycle.
- [x] The construction/deletion proof uses only Ontahi's generic Entity machinery, not custom
      application Operations.
- [x] No out-of-scope runtime or package surface changes.
- [x] Focused tests, Core tests, typecheck, lint, and formatting pass.

## Open Questions

1. Should the first fluent authoring surface hang from a single-Entity Selection, an Entity Ref, or
   a lower-level factory while the public ergonomics remain provisional?
2. Should the public authoring vocabulary expose endpoint-neutral `link/unlink`, or keep
   `assign/clear/add/remove` as ergonomic forms over that canonical action pair?
3. Does an applied delta belong directly in the command result or in an outcome wrapper that can
   later compose with provider execution evidence?
4. Does the experiment reveal a missing generic Entity construction contract for required Fields,
   distinct from relationship semantics?

## Decisions

1. Canonical commands use endpoint-neutral `link/unlink`; `assign/clear/add/remove` remain authoring
   vocabulary.
2. `clear` has no target precondition, while inverse `remove` preserves its expected target. Applied
   deltas converge only when the fact actually matches.
3. The first authoring API is a low-level `relationship(Entity, relationName, subjectRef)` factory;
   a fluent Entity-bound facade remains deferred until remote transport needs a stable public form.
4. Applied delta is the direct local executor result for this experiment. An outcome wrapper belongs
   with plan 128 transport/execution composition.
5. Generic in-memory Entity construction now validates every non-optional Field, which makes required
   participant Refs framework-enforced without introducing an Association Entity kind.

## Closure

- Status: done
- Closed on: 2026-08-19
- Effective effort: ~1-2h focused implementation and verification
- Outcome: canonical Relationship Commands and applied deltas proven in Core/in-memory; ordinary
  Entity construction/deletion proven sufficient for the structural Association Entity lifecycle.
- Verification:
  - focused Relationship Command tests: 7 passed;
  - full Core suite: 66 files and 489 tests passed;
  - Core typecheck and lint passed;
  - all package builds passed.
- Next integration: Plan 128 may carry this IR across runtime boundaries without converting it into
  an Entity patch or a generated Domain Operation.
