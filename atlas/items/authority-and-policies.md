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
  - ontahi://plans/161-authority-scoped-nested-view-materialization
  - ontahi://plans/153a-model-execution-security-and-authorization
  - ontahi://plans/157-bartlett-consumer-ergonomics
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

Graph Read policy distinguishes selecting, filtering, and ordering a Field. A readable scalar is
not necessarily authorized for ordering. When an otherwise authorized Query is rejected for its
ordering, the receiver preserves `access_denied` but identifies the requested Entity and Field in
a safe message and structured `ordering_not_allowed` detail. This applies to reads and observation;
it never reveals row-scope predicates, private dependency names, or executor failures. Missing
policies and other authorization failures retain a generic rejection. Static authoring reflection
is assistance, not evidence of effective authority.

Policy authoring may express these independent capabilities as typed select, filter and order
allowlists through `defineGraphReadPolicy`. That constructor lowers to the same canonical Field
policy consumed by the dispatcher; it does not infer permissions from application Queries or
weaken the default-deny boundary.

Graph Read authority currently scopes the root population only. Relation policy nodes authorize
nested projection shape but do not intersect the registered target Entity scope while a View is
materialized. Plan 161 owns the security contract and provider execution work required for every
nested Entity population to enforce receiver-owned authority. Until that lands, consumers must use
separate authorized roots instead of assuming a nested relation policy filters related rows.

Model-mediated invocation is an emerging consumer of this authority boundary. A resolved proposal
cannot grant permissions, replace the authenticated Principal, or turn model-visible graph scope
into write authority. Plan 153a owns prompt-injection and authorization hardening, including the
distinction between reading data, disclosing it to a model provider, and applying proposed effects.
This is deferred design work, not an implemented security guarantee.
