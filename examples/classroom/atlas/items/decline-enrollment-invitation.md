---
id: ontahi.examples.classroom.enrollment-invitation.decline
kind: operation
title: Decline Enrollment Invitation
parent: ontahi.examples.classroom.enrollment-invitation
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Decline Enrollment Invitation lets the proven recipient reject a Pending proposal without creating
Classroom access.

## Receiver

`Enrollment Invitation`

## Actor

`Recipient`: the proven User identified by the invitation's `recipient` relation.

## Inputs And Output

| Direction | Value             | Meaning                                   |
| --------- | ----------------- | ----------------------------------------- |
| input     | resolution time   | Value recorded as `resolvedAt`            |
| output    | declined proposal | The same invitation in its terminal state |

## Availability

The invitation is `Pending` and the actor matches its recipient identity.

## Transition And Effects

`Pending -> Declined`

1. Set `resolvedAt` to the resolution time.
2. Withdraw the invitation's decision affordances.
3. Do not create an Enrollment.

## Failures

| Failure                  | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `invitation-not-pending` | The invitation has already reached a terminal state |
| `recipient-mismatch`     | The actor is not the invitation's proven recipient  |

## Invariants Preserved

`explicit-access`, `recipient-authority`, `terminal-is-final`, and `resolution-consistency` from
Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
