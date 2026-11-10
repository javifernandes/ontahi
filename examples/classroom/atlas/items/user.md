---
id: ontahi.examples.classroom.user
kind: entity
title: User
parent: ontahi.examples.classroom
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.entity
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

A User is a person with a proven identity who may create, manage, or join Classrooms. Authentication
providers establish identities; the User preserves the domain identity across those providers.

## Data

| Field         | Type       | Required | Meaning                                      |
| ------------- | ---------- | -------- | -------------------------------------------- |
| `id`          | `UserId`   | yes      | Stable domain identity                       |
| `displayName` | `String`   | yes      | Human-readable name shown inside a Classroom |
| `createdAt`   | `DateTime` | yes      | Moment the User entered the system           |

## Relations

| Relation              | Target                  | Cardinality | Meaning                                         |
| --------------------- | ----------------------- | ----------- | ----------------------------------------------- |
| `enrollments`         | `Enrollment`            | many        | Explicit Classroom memberships held by the User |
| `sentInvitations`     | `Enrollment Invitation` | many        | Invitations issued while managing a Classroom   |
| `receivedInvitations` | `Enrollment Invitation` | many        | Invitations addressable to this proven identity |

## States

| State    | Kind   | Meaning                                                   |
| -------- | ------ | --------------------------------------------------------- |
| `Active` | active | The User may participate according to current Enrollments |

## Operations

| Operation         | Actor  | Applies when       | Transition | Effects                                     |
| ----------------- | ------ | ------------------ | ---------- | ------------------------------------------- |
| `CreateClassroom` | `User` | actor is this User | `none`     | create a Classroom and one Owner Enrollment |

## Invariants

| Rule                     | Constraint                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `provider-independent`   | Domain identity does not depend on one authentication provider |
| `membership-is-explicit` | Repository activity or observation never creates an Enrollment |
