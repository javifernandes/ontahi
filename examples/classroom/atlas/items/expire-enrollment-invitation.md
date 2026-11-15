---
id: ontahi.examples.classroom.enrollment-invitation.expire
kind: operation
title: Expire Enrollment Invitation
parent: ontahi.examples.classroom.enrollment-invitation
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Expire Enrollment Invitation closes a Pending proposal after its acceptance boundary has passed.

## Receiver

`Enrollment Invitation`

## Actor

`System`: trusted lifecycle processing rather than a Classroom member.

## Inputs And Output

| Direction | Value            | Meaning                                       |
| --------- | ---------------- | --------------------------------------------- |
| input     | current time     | Establishes that `expiresAt` has been reached |
| output    | expired proposal | The same invitation in its terminal state     |

## Availability

The invitation is `Pending` and current time is at or after `expiresAt`.

## Transition And Effects

`Pending -> Expired`

1. Set `resolvedAt` to the expiration processing time.
2. Withdraw all decision and revocation affordances.
3. Do not create an Enrollment.

## Failures

| Failure                  | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `invitation-not-pending` | The invitation has already reached a terminal state |
| `expiration-not-reached` | Current time is still before `expiresAt`            |

## Invariants Preserved

`explicit-access`, `terminal-is-final`, and `resolution-consistency` from Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
