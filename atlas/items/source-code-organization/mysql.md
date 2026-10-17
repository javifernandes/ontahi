---
id: ontahi.source-code-organization.mysql
kind: artifact
title: @ontahi/mysql
parent: ontahi.source-code-organization
status: active
horizon: now
supports:
  - ontahi.runtime-capability-model
  - ontahi.model.event
relatedPlans:
  - ontahi://plans/146j-first-class-events-runtime-protocol-gate
  - ontahi://plans/155-adapter-capability-completeness
---

`@ontahi/mysql` is a MySQL technology adapter package whose independently usable entrypoints
implement distinct Ontahi concerns. It is neither a generic SQL client nor an all-or-nothing
application adapter.

The `@ontahi/mysql/data-graph` entrypoint owns direct MySQL graph storage, mappings, commands,
transactions, reflection, and provider-specific mutation coordination. The
`@ontahi/mysql/events` entrypoint owns retained Event Occurrences and durable subscription delivery
through MySQL 8.4/InnoDB. Hosts can use either capability alone or compose both explicitly.

The `@ontahi/mysql/tasks` entrypoint independently persists Task sources and snapshots and atomically
claims Interaction and Event-wait continuations. It passes the same Core Task Storage conformance
proof as PostgreSQL, including concurrency and runtime-recreation evidence. Sharing one pool does
not imply cross-concern atomicity.

The host owns credentials, Pool construction, schema migration, grants, and lifecycle. The Event
adapter exposes a migration-oriented schema contract and advertises retention, durable acceptance,
durable delivery, acknowledgement, and subscription ordering. It does not advertise replay,
deduplication, or atomic publication with Data Graph mutations.

MySQL independently passes the provider-neutral durable Event Runtime conformance proof already
used by PostgreSQL. Its user locks, InnoDB row claims, JSON predicates, physical schema, and hashed
delivery identities remain adapter-private. This second implementation is evidence that Core's
Event contracts describe application semantics rather than PostgreSQL mechanics.
