---
id: ontahi.examples.classroom.classroom.archive
kind: operation
title: Archive Classroom
parent: ontahi.examples.classroom.classroom
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Archive Classroom permanently closes participation in one Classroom while preserving its modeled
history.

## Receiver

`Classroom`

## Actor

`Owner`: a User holding an active Owner Enrollment in the Classroom.

## Inputs And Output

| Direction | Value                | Meaning                                  |
| --------- | -------------------- | ---------------------------------------- |
| input     | archive time         | Value recorded as `archivedAt`           |
| output    | archived `Classroom` | The same Classroom in its terminal state |

## Availability

The Classroom is Active and the actor has an active Owner Enrollment in it.

## Transition And Effects

`Active -> Archived`

1. Set `archivedAt` to the archive time.
2. Revoke every Pending Enrollment Invitation for the Classroom.
3. Withdraw participation and membership-management affordances without deleting history.

## Failures

| Failure                    | Meaning                                              |
| -------------------------- | ---------------------------------------------------- |
| `classroom-not-active`     | The Classroom has already reached its terminal state |
| `owner-enrollment-missing` | The actor does not hold Owner authority              |

## Invariants Preserved

`archive-is-final` and `roles-through-enrollment` from Classroom, plus `terminal-is-final` from
Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
