---
id: ontahi.examples.classroom.enrollment
kind: entity
title: Enrollment
parent: ontahi.examples.classroom
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.entity
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

An Enrollment is the explicit relationship granting one User a role in one Classroom. It is the
authority-bearing membership record produced by creation or by accepting an invitation.

## Data

| Field       | Type                                | Required | Meaning                                        |
| ----------- | ----------------------------------- | -------- | ---------------------------------------------- |
| `id`        | `EnrollmentId`                      | yes      | Stable identity of the membership relationship |
| `role`      | `enum(Owner, Collaborator, Viewer)` | yes      | Authority held inside the Classroom            |
| `startedAt` | `DateTime`                          | yes      | Moment access became active                    |
| `endedAt`   | `DateTime`                          | no       | Moment access ceased                           |

## Relations

| Relation     | Target                  | Cardinality | Meaning                                           |
| ------------ | ----------------------- | ----------- | ------------------------------------------------- |
| `classroom`  | `Classroom`             | one         | Collaboration space whose access is granted       |
| `user`       | `User`                  | one         | Person receiving the role                         |
| `invitation` | `Enrollment Invitation` | zero-or-one | Accepted proposal that originated this membership |

## States

| State    | Kind     | Meaning                                    |
| -------- | -------- | ------------------------------------------ |
| `Active` | initial  | The User currently holds the declared role |
| `Ended`  | terminal | The role no longer grants access           |

## Operations

| Operation    | Actor             | Applies when                                           | Transition        | Effects                              |
| ------------ | ----------------- | ------------------------------------------------------ | ----------------- | ------------------------------------ |
| `ChangeRole` | `Owner`           | Enrollment is Active and target is not the last Owner  | `none`            | replace the granted role             |
| `End`        | `Owner or Member` | Enrollment is Active and ending it preserves one Owner | `Active -> Ended` | set `endedAt` and withdraw authority |

## Invariants

| Rule                       | Constraint                                                 |
| -------------------------- | ---------------------------------------------------------- |
| `unique-active-membership` | A User has at most one Active Enrollment per Classroom     |
| `last-owner-protected`     | An operation cannot remove or demote the last active Owner |
| `ended-at-consistency`     | `endedAt` exists exactly when state is Ended               |
