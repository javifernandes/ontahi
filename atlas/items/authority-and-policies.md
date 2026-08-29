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
  - ontahi://plans/128f-remote-identity-scoped-entity-mutation-commands
migratedFrom: bookops://atlas/authority-and-policies
sourceCommit: 67713696
---

Authority And Policies cover who can do what, where authority lives, how relationships affect permissions, and how distributed or reconciled authority may work later.

Authorization begins with an authenticated Principal supplied by
[`Authentication And Principal`](./application-architecture-surface/authentication-and-principal.md),
but does not own session or identity-provider resolution.

Remote Entity writes are default-deny independently from Entity registration. The first bounded
policy opts into exact create/update/delete per Entity, allowlists both mutation and result Fields,
and requires the deliberately visible `scope: 'all'`. Authority-derived row scope is not a
read-then-write check: it must later become one atomic intersection with the exact mutation target.
