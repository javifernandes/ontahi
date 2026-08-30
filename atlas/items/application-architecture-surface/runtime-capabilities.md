---
id: ontahi.runtime-capability-model
kind: system-primitive
title: Runtime Capability Model
parent: ontahi.application-architecture-surface
status: shaping
horizon: now
supports:
  - ontahi
  - ontahi.durable-workflows
  - ontahi.source-code-organization
relatedPlans:
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/71c-ontahi-application-module-composition
  - bookops://plans/100e-ontahi-runtime-capabilities-and-repository-topology
  - bookops://plans/100j-ontahi-in-memory-persistence-runtime
  - bookops://plans/100f-operation-invocation-capability
  - bookops://plans/100i-ontahi-observability-adapter-boundary
  - bookops://plans/125-ontahi-ai-operations
  - bookops://plans/126-ontahi-runtime-data-reflection
  - bookops://plans/130-ontahi-authentication-principal-and-invocation-context
  - ontahi://plans/142c-reflected-atomic-operation-execution
  - ontahi://plans/128f-remote-identity-scoped-entity-mutation-commands
  - ontahi://plans/128g-supabase-exact-entity-mutation-commands
  - ontahi://plans/138a-client-entity-mutation-authoring
  - ontahi://plans/138b-conditional-exact-entity-mutations
  - ontahi://plans/146-ontahi-runtime-protocol
migratedFrom: bookops://atlas/application-architecture-surface/runtime-capabilities
sourceCommit: 67713696
---

Runtime Capability Model defines how an Ontahi application separates semantic capabilities, technology-independent ports, technology adapters, and host composition.

It distinguishes authoritative domain state, durable execution state, coordination state, derived state, event/log state, and object state. Technologies such as PostgreSQL, Redis, Supabase, Vercel Workflow, DBOS, Restate, and RabbitMQ may implement one or more capabilities, but their different guarantees should remain visible in the framework contracts.

The model is the design surface for pluggable graph persistence, durable task execution, task run storage, client/server transport, identity and authority, coordination, caching, events, telemetry/reporting, object storage, clocks, IDs, and scheduling.

Authentication makes the distinction between configured capabilities and live scoped resources
concrete. Passport, Supabase, Auth0, Okta, or another host mechanism authenticates a native request;
the host then contributes a provider-neutral Principal to the invocation scope. Operations consume
that Principal without importing the provider or transport.

Model-backed operation execution adds executor bindings, declared graph sources and tools, budgets,
trace and evaluation sinks, and optional private workspaces to this runtime surface. Those resources
must be scoped and composed like other host capabilities; model memory or scratch state does not
become authoritative graph state by default.

Runtime Data Reflection adds a dynamic profile over live Entity and Selection populations. Storage,
search, cache, projection, or remote-segment adapters may contribute observations, while the
runtime preserves exactness, freshness, cost, capabilities, and authority in a provider-neutral
contract.

BookOps remains a host composition: it chooses adapters, credentials, routes, registries, domain declarations, and application policy. Ontahi owns only the framework semantics proven reusable across hosts.

Domain declarations may depend on narrow, technology-independent application capabilities without importing the host root. BookOps `ContentNode` demonstrates this boundary: its exercise operation owns the use-case policy, while host composition supplies repository and AI implementations through an `ExerciseRuntimeCapability`. This keeps one semantic entity declaration without creating application-initialization cycles.

For observability, core owns vendor-neutral telemetry and reporting ports. `@ontahi/opentelemetry` implements span creation and Ontahi runtime attributes, while each host registers its SDK, resources, processors, and exporters. BookOps keeps Sentry reporting local until another host proves that adapter reusable; Axiom and SigNoz remain interchangeable OTLP destinations rather than Ontahi adapters.

For authoritative graph state, `@ontahi/core` provides a process-local reference implementation of
the complete execution port. It owns live seeded state, plain and relation-root reads, counts,
commands, and reflected Explorer data. Supabase provides external durability, while
`@ontahi/postgres` now provides provider-executed SQL, host-owned physical mappings, graph runtime
conformance, and reflected Entity data over direct PostgreSQL connections.

Entity Mutation Command execution is a focused capability beside generic provider Commands and
Relationship Commands. In-memory, PostgreSQL, and Supabase runtimes implement exact
create/update/delete; the remote runtime implements the same capability only when a Command
transport is configured. Supabase lowers each exact command to one PostgREST mutation under grants
and RLS without claiming compositional transactions. React's Fetch executor exposes the portable
capability without claiming that every local provider supports it. A missing capability is explicit
rather than a silent remote or provider fallback.

Generated client Entities author that portable capability through `Entity.create(values)` and
exact Ref `update(values)` / `delete()` methods. Runtime binding upgrades the authored Commands with
a non-enumerable `.run()` that resolves the current capability lazily. The semantic Entity, Ref,
and serialized Command remain free of runtime ownership.

An exact Ref update/delete can include `{ if: { ...observedFields } }`. Supporting the Entity
Mutation Command capability includes applying that condition atomically with the mutation; a
runtime must not claim support and lower it to a read followed by a write. Remote authority grants
condition Fields separately from writable and returned Fields.

Operation declarations may require a semantic guarantee without naming the adapter that supplies
it. `operation.atomic(...)` reflects `execution.atomicity: 'required'`, from which Core derives the
`data-graph.atomicity` requirement. A live runtime capability claim is separate evidence: the
server validates it against the active Data Graph runtime, while client bindings can advertise a
local executor or a bridge. The provider-neutral planner reports `local`, `bridge`, or
`unavailable`; it does not turn deployment topology into model metadata or authorization.
