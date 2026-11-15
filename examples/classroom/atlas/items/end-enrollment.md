---
id: ontahi.examples.classroom.enrollment.end
kind: operation
title: End Enrollment
parent: ontahi.examples.classroom.enrollment
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

End Enrollment withdraws one User's current Classroom authority while preserving the membership
record.

## Receiver

`Enrollment`

## Actor

`Owner or Member`: an Owner may end another membership; a member may end their own Enrollment.

## Inputs And Output

| Direction | Value              | Meaning                                |
| --------- | ------------------ | -------------------------------------- |
| input     | end time           | Value recorded as `endedAt`            |
| output    | ended `Enrollment` | The same membership in its final state |

## Availability

The Enrollment is Active, the actor either owns the Enrollment or has active Owner authority in
the Classroom, and ending it leaves at least one active Owner.

## Transition And Effects

`Active -> Ended`

1. Set `endedAt` to the end time.
2. Withdraw every Classroom affordance derived from the Enrollment.
3. Preserve the membership and its prior role as history.

## Failures

| Failure                 | Meaning                                                |
| ----------------------- | ------------------------------------------------------ |
| `enrollment-not-active` | The membership is already Ended                        |
| `actor-not-authorized`  | The actor is neither this member nor a Classroom Owner |
| `last-owner-protected`  | Ending the Enrollment would leave no active Owner      |

## Invariants Preserved

`last-owner-protected`, `ended-at-consistency`, and `unique-active-membership` from Enrollment,
plus `has-owner` from Classroom.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
