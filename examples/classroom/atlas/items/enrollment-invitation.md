---
id: ontahi.examples.classroom.enrollment-invitation
kind: entity
title: Enrollment Invitation
parent: ontahi.examples.classroom
status: shaping
horizon: now
typeOf:
  - spec-workstream-atlas.atlas-model.entity
relatedPlans:
  - atlas://plans/146-package-manifest-and-classroom-model
---

An Enrollment Invitation is a durable proposal for a recipient to join one Classroom. It separates
observed repository participation from explicit access and records the complete decision lifecycle.

## Data

| Field          | Type               | Required | Meaning                                    |
| -------------- | ------------------ | -------- | ------------------------------------------ |
| `id`           | `InvitationId`     | yes      | Stable identity of the proposal            |
| `proposedRole` | `ClassroomRole`    | yes      | Role granted if the recipient accepts      |
| `status`       | `InvitationStatus` | yes      | Current lifecycle state                    |
| `createdAt`    | `DateTime`         | yes      | Moment the invitation became available     |
| `expiresAt`    | `DateTime`         | yes      | Boundary after which acceptance is invalid |
| `resolvedAt`   | `DateTime`         | no       | Moment a terminal state was reached        |

## Relations

| Relation     | Target       | Cardinality | Meaning                                                 |
| ------------ | ------------ | ----------- | ------------------------------------------------------- |
| `classroom`  | `Classroom`  | one         | Classroom whose access is being proposed                |
| `inviter`    | `User`       | one         | Classroom member responsible for issuing the invitation |
| `recipient`  | `User`       | one         | Proven User allowed to accept or decline                |
| `enrollment` | `Enrollment` | zero-or-one | Membership produced by a successful acceptance          |

## States

| State      | Kind     | Meaning                                                   |
| ---------- | -------- | --------------------------------------------------------- |
| `Pending`  | initial  | The recipient may still decide and the inviter may revoke |
| `Accepted` | terminal | The recipient accepted and an Enrollment was created      |
| `Declined` | terminal | The recipient explicitly declined                         |
| `Revoked`  | terminal | The inviter withdrew the proposal                         |
| `Expired`  | terminal | The expiration boundary passed before another resolution  |

## Operations

| Operation | Actor                   | Applies when                                                                          | Transition            | Effects                                            |
| --------- | ----------------------- | ------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| `Invite`  | `Owner or Collaborator` | actor has a managing Enrollment and no equivalent Pending invitation exists           | `none -> Pending`     | persist the proposal and notify the recipient      |
| `Accept`  | `Recipient`             | status is Pending, recipient identity matches, and current time is before `expiresAt` | `Pending -> Accepted` | create exactly one Enrollment and set `resolvedAt` |
| `Decline` | `Recipient`             | status is Pending and recipient identity matches                                      | `Pending -> Declined` | set `resolvedAt`                                   |
| `Revoke`  | `Inviter`               | status is Pending and actor is the inviter                                            | `Pending -> Revoked`  | set `resolvedAt` and withdraw availability         |
| `Expire`  | `System`                | status is Pending and current time is at or after `expiresAt`                         | `Pending -> Expired`  | set `resolvedAt` and withdraw availability         |

## Invariants

| Rule                       | Constraint                                                                       |
| -------------------------- | -------------------------------------------------------------------------------- |
| `explicit-access`          | Observed participation never creates an Enrollment                               |
| `recipient-authority`      | Only the proven recipient User can accept or decline                             |
| `single-active-invitation` | A recipient has at most one Pending invitation per Classroom and proposed role   |
| `single-enrollment`        | Accepting produces at most one active Enrollment for the recipient and Classroom |
| `terminal-is-final`        | A terminal invitation cannot transition again                                    |
| `resolution-consistency`   | `resolvedAt` exists exactly when status is terminal                              |
