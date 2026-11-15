---
id: ontahi.examples.classroom.enrollment.change-role
kind: operation
title: Change Enrollment Role
parent: ontahi.examples.classroom.enrollment
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Change Enrollment Role replaces the authority granted by one active Enrollment without creating a
second membership.

## Receiver

`Enrollment`

## Actor

`Owner`: a User holding an active Owner Enrollment in the same Classroom.

## Inputs And Output

| Direction | Value                | Meaning                                      |
| --------- | -------------------- | -------------------------------------------- |
| input     | `role`               | New Owner, Collaborator, or Viewer authority |
| output    | updated `Enrollment` | The same active membership with its new role |

## Availability

The Enrollment is Active, the actor has active Owner authority in the Classroom, and changing the
role does not demote the last active Owner.

## Transition And Effects

`Active -> Active`

1. Replace the Enrollment's role with the supplied role.
2. Recompute the receiver User's available Classroom operations from that authority.
3. Preserve the Enrollment identity and membership history.

## Failures

| Failure                    | Meaning                                               |
| -------------------------- | ----------------------------------------------------- |
| `enrollment-not-active`    | The target membership no longer grants authority      |
| `owner-enrollment-missing` | The actor cannot manage roles in this Classroom       |
| `role-invalid`             | The supplied role is outside the Classroom role model |
| `last-owner-protected`     | The change would leave the Classroom without an Owner |

## Invariants Preserved

`unique-active-membership` and `last-owner-protected` from Enrollment, plus `has-owner` from
Classroom.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
