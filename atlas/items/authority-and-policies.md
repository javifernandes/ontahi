---
id: ontahi.authority-policies
kind: system-primitive
title: Authority And Policies
parent: ontahi
status: in-progress
horizon: now
supports:
  - ontahi
  - bookops
relatedPlans:
  - bookops://plans/78-first-class-authorization-and-relationship-policies
  - bookops://plans/59-authority-scoped-domain-operations-over-the-data-graph
  - bookops://plans/92-authority-distribution-and-reconciliation-sandboxes
migratedFrom: bookops://atlas/authority-and-policies
sourceCommit: 67713696
---

Authority And Policies cover who can do what, where authority lives, how relationships affect permissions, and how distributed or reconciled authority may work later.

Authorization begins with an authenticated Principal supplied by
[`Authentication And Principal`](./application-architecture-surface/authentication-and-principal.md),
but does not own session or identity-provider resolution.
