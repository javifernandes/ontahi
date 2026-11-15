---
id: ontahi.examples.classroom.enrollment-invitation.invite
kind: operation
title: Invite To Classroom
parent: ontahi.examples.classroom.enrollment-invitation
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Invite To Classroom lets a managing member propose explicit Classroom access to one proven User.
It creates the Enrollment Invitation whose later Operations resolve the proposal.

## Receiver

`Classroom`

## Actor

`Owner or Collaborator`: a User with a managing Enrollment in the Classroom.

## Inputs And Output

| Direction | Value                   | Meaning                                                 |
| --------- | ----------------------- | ------------------------------------------------------- |
| input     | `recipient`             | Proven User being invited                               |
| input     | `proposedRole`          | Classroom role granted after acceptance                 |
| input     | `expiresAt`             | Boundary after which acceptance is unavailable          |
| output    | `Enrollment Invitation` | Newly persisted proposal in the `Pending` initial state |

## Availability

The Classroom is active, the actor has a managing Enrollment, no equivalent Pending invitation
exists for the recipient, Classroom, and proposed role, and `expiresAt` is after the current time.

## Transition And Effects

`none -> Pending`

1. Persist one Enrollment Invitation relating the Classroom, inviter, and recipient.
2. Record the proposed role and expiration boundary.
3. Notify the recipient that the proposal is available.

## Failures

| Failure                       | Meaning                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `classroom-not-active`        | The Classroom does not currently accept access proposals |
| `managing-enrollment-missing` | The actor cannot manage Classroom access                 |
| `recipient-not-proven`        | The target identity does not resolve to a proven User    |
| `pending-invitation-exists`   | An equivalent unresolved proposal already exists         |
| `expiration-not-future`       | The expiration boundary is not after the current time    |

## Invariants Preserved

`explicit-access` and `single-active-invitation` from Enrollment Invitation.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
