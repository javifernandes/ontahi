---
id: ontahi.source-code-organization.postgres
kind: artifact
title: @ontahi/postgres
parent: ontahi.source-code-organization
status: active
horizon: now
supports:
  - ontahi.runtime-capability-model
  - ontahi.model.event
relatedPlans:
  - ontahi://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/146j-first-class-events-runtime-protocol-gate
  - ontahi://plans/155-adapter-capability-completeness
---

`@ontahi/postgres` is a PostgreSQL technology adapter package, not a generic SQL client or one
monolithic application adapter. It provides independently usable implementations of Ontahi
concerns backed by PostgreSQL guarantees.

The `@ontahi/postgres/data-graph` entrypoint owns direct provider-executed graph storage, mappings,
commands, transactions, reflection, and schema inspection. The `@ontahi/postgres/events`
entrypoint owns retained Event Occurrences and stable durable delivery subscriptions with
correlation, leased claim, acknowledgement, release, retry, cancellation, and runtime recreation.
Using one entrypoint neither configures nor requires the other.

The host owns credentials, Pool construction, physical schema, migrations, and composition. The
Event adapter exposes a migration-oriented schema contract but never migrates at runtime. Its
current acceptance and delivery are durable, while publication does not yet share the Data Graph
transaction and therefore does not advertise atomic publication. Provider tables, claims, and
leases remain adapter-private; semantic declarations, occurrences, deliveries, capabilities, and
the conformance contract remain provider-neutral Core APIs.

The `@ontahi/postgres/tasks` entrypoint is a third independent concern. It persists Task sources and
snapshots, supports runtime recreation and listing, and atomically claims Interaction and Event-wait
continuations. It passes Core's Task Storage conformance proof and composes with the native Task
Runtime without making Task writes atomic with Data Graph mutations or Event acceptance.

This package shape proves that one technology package may implement several Ontahi concerns
independently. Coordination and community extensions should follow the same opt-in composition
rule rather than grow a required all-in-one PostgreSQL adapter.
