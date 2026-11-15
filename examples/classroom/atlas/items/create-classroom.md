---
id: ontahi.examples.classroom.user.create-classroom
kind: operation
title: Create Classroom
parent: ontahi.examples.classroom.user
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.operation
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

Create Classroom lets an active User establish a new collaboration space and become its first
Owner. Classroom creation and the initial authority grant form one domain outcome.

## Receiver

`User`

## Actor

`User`: the proven User receiving the initial Owner Enrollment.

## Inputs And Output

| Direction | Value              | Meaning                                      |
| --------- | ------------------ | -------------------------------------------- |
| input     | `name`             | Human-readable name of the new Classroom     |
| output    | `Classroom`        | Newly persisted collaboration space          |
| output    | `Owner Enrollment` | Initial active authority held by the creator |

## Availability

The actor matches the receiver's proven identity and the User is Active.

## Transition And Effects

`none -> Active Classroom`

1. Persist one Active Classroom with the supplied name.
2. Persist one active Owner Enrollment relating the creator and Classroom.
3. Make the Classroom discoverable to that User through the new Enrollment.

## Failures

| Failure                  | Meaning                                             |
| ------------------------ | --------------------------------------------------- |
| `user-not-active`        | The receiver cannot establish a collaboration space |
| `actor-mismatch`         | The actor is not the proven receiver User           |
| `classroom-name-invalid` | The supplied name does not satisfy naming policy    |

## Invariants Preserved

`has-owner` from Classroom, `unique-active-membership` from Enrollment, and
`membership-is-explicit` from User.

## Implementation

Not materialized yet. The current Classroom example implementation still models a different
School/Course/Student domain; this Item describes the target semantic model rather than claiming
implementation evidence.
