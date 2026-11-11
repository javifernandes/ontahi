---
id: ontahi.examples.classroom.enrollment-invitation.accept
kind: operation
title: Accept Enrollment Invitation
parent: ontahi.examples.classroom.enrollment-invitation
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Accept Enrollment Invitation lets the proven recipient turn one Pending invitation into an
explicit Classroom Enrollment. It is the first standalone Operation Item in the Classroom model.

## Receiver

`Enrollment Invitation`

## Actor

`Recipient`: the proven User identified by the invitation's `recipient` relation.

## Inputs And Output

| Direction | Value        | Meaning                                                              |
| --------- | ------------ | -------------------------------------------------------------------- |
| input     | current time | Establishes that `expiresAt` has not passed                          |
| output    | `Enrollment` | The unique active membership created for the recipient and Classroom |

## Availability

The invitation is `Pending`, the actor matches its recipient identity, current time is before
`expiresAt`, and no active Enrollment already exists for the same User and Classroom.

## Transition And Effects

`Pending -> Accepted`

1. Create exactly one active Enrollment with the proposed role.
2. Relate that Enrollment to the invitation.
3. Set `resolvedAt` to the resolution time.

## Failures

| Failure                     | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `invitation-not-pending`    | The invitation has already reached a terminal state |
| `recipient-mismatch`        | The actor is not the invitation's proven recipient  |
| `invitation-expired`        | The acceptance boundary has passed                  |
| `enrollment-already-exists` | An active Enrollment already grants access          |

## Invariants Preserved

`recipient-authority`, `single-enrollment`, `terminal-is-final`, and
`resolution-consistency` from Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
