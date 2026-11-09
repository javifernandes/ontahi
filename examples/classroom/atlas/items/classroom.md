---
id: ontahi.examples.classroom.classroom
kind: entity
title: Classroom
parent: ontahi.examples.classroom
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.entity
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

A Classroom is the collaboration space that Users join through explicit Enrollments. It owns the
membership boundary and the roles that authorize management and participation.

## Data

| Field        | Type          | Required | Meaning                                    |
| ------------ | ------------- | -------- | ------------------------------------------ |
| `id`         | `ClassroomId` | yes      | Stable identity of the collaboration space |
| `name`       | `String`      | yes      | Human-readable Classroom name              |
| `createdAt`  | `DateTime`    | yes      | Moment the Classroom was created           |
| `archivedAt` | `DateTime`    | no       | Moment participation was frozen            |

## Relations

| Relation      | Target                  | Cardinality | Meaning                                          |
| ------------- | ----------------------- | ----------- | ------------------------------------------------ |
| `enrollments` | `Enrollment`            | many        | Explicit memberships and roles in this Classroom |
| `invitations` | `Enrollment Invitation` | many        | Proposals to create future Enrollments           |

## States

| State      | Kind     | Meaning                                         |
| ---------- | -------- | ----------------------------------------------- |
| `Active`   | initial  | Members may participate according to their role |
| `Archived` | terminal | New participation and invitations are disabled  |

## Operations

| Operation    | Actor                   | Applies when                                            | Transition           | Effects                                             |
| ------------ | ----------------------- | ------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `InviteUser` | `Owner or Collaborator` | Classroom is Active and actor has a managing Enrollment | `none`               | create a Pending Enrollment Invitation              |
| `Archive`    | `Owner`                 | Classroom is Active                                     | `Active -> Archived` | revoke Pending invitations and freeze participation |

## Invariants

| Rule                       | Constraint                                                        |
| -------------------------- | ----------------------------------------------------------------- |
| `has-owner`                | Every Active Classroom has at least one active Owner Enrollment   |
| `roles-through-enrollment` | A User has no Classroom role outside an active Enrollment         |
| `archive-is-final`         | An Archived Classroom cannot admit new Enrollments or invitations |
