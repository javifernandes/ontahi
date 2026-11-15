---
id: ontahi.examples.classroom.enrollment-invitation.revoke
kind: operation
title: Revoke Enrollment Invitation
parent: ontahi.examples.classroom.enrollment-invitation
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Revoke Enrollment Invitation lets the inviter withdraw a Pending proposal before the recipient
resolves it.

## Receiver

`Enrollment Invitation`

## Actor

`Inviter`: the User identified by the invitation's `inviter` relation.

## Inputs And Output

| Direction | Value            | Meaning                                   |
| --------- | ---------------- | ----------------------------------------- |
| input     | resolution time  | Value recorded as `resolvedAt`            |
| output    | revoked proposal | The same invitation in its terminal state |

## Availability

The invitation is `Pending` and the actor is the invitation's inviter.

## Transition And Effects

`Pending -> Revoked`

1. Set `resolvedAt` to the resolution time.
2. Withdraw the recipient's decision affordances.
3. Do not create an Enrollment.

## Failures

| Failure                  | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `invitation-not-pending` | The invitation has already reached a terminal state |
| `inviter-mismatch`       | The actor is not the User who issued the invitation |

## Invariants Preserved

`explicit-access`, `terminal-is-final`, and `resolution-consistency` from Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
