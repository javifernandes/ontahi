---
id: ontahi.model.semantic-subjects-and-runtime-concerns
kind: concept
title: Semantic Subjects And Runtime Concerns
parent: ontahi.model
status: shaping
horizon: later
supports:
  - ontahi.model.entity
  - ontahi.model.domain-operation
  - ontahi.model.operation-interaction
  - ontahi.model.unit-of-work
  - ontahi.authority-policies
relatedPlans:
  - ontahi://plans/158-semantic-execution-context-governance-and-evidence
  - ontahi://plans/158a-semantic-execution-context-propagation-proof
  - ontahi://plans/125a-model-execution-resource-governance
  - ontahi://plans/153a-model-execution-security-and-authorization
  - ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation
---

Ontahí's emerging metamodel contains several first-level semantic subjects with different enduring
meanings:

1. an [[ontahi.model.entity|Entity]] is an identifiable domain thing whose state and relationships
   can evolve;
2. a [[ontahi.model.domain-operation|Domain Operation]] is an application action with a declared
   contract and execution lifecycle;
3. a Resource is a named scarce, external, metered, or capability-bearing thing used during
   execution;
4. an [[ontahi.model.operation-interaction|Interaction]] is a typed request for information or a
   decision from a participant.

These subjects are not variants of one universal object. They have different identity, lifecycle,
composition, execution, and persistence semantics. They can nevertheless participate in shared
runtime concerns such as governance, audit evidence, policy, reflection, localization, and
observability. The shared concern does not erase the subject's meaning: an Entity change, Operation
attempt, Resource consumption, and Interaction response require different evidence payloads even
when one causal execution relates all four.

## Subject And Concern

`Entity`, `Operation`, `Resource`, and `Interaction` are candidate language-level nouns. `Auditable`
and `Governable` are candidate concerns or traits over those nouns:

| Semantic subject | Characteristic meaning                     | Example auditable evidence                      | Example governance decision               |
| ---------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------- |
| Entity           | Identifiable domain state                  | create, update, delete, relationship change     | may this state be read or changed?        |
| Operation        | Contracted application action              | requested, admitted, started, completed, failed | may it run, under which requirements?     |
| Resource         | Capability or consumable used by execution | model tokens, API calls, time, capacity         | which binding and limit may be consumed?  |
| Interaction      | Typed participant request and response     | requested, presented, answered, expired         | who may see or answer it, and until when? |

Auditability asks which evidence must be captured, disclosed, retained, or exported. Governance
asks which decisions constrain admission, execution, disclosure, routing, approval, consumption,
or continuation. A subject may be auditable without being governed by a configurable policy, and a
governance decision may be made without retaining a durable audit record. Authorization is one
governance decision; resource limits, approval, routing, retention, and disclosure are other
possible decisions. A positive resource budget never grants authority to execute an Operation or
mutate an Entity.

This vocabulary is intentionally not yet a TypeScript trait hierarchy. Shared declarations should
be promoted only when two or more subject kinds prove the same semantics, enforcement point, and
reflection needs. Similar-looking metadata is insufficient evidence for a common abstraction.

## Semantic Execution Context

Shared concerns need a trustworthy context that is supplied and propagated by the runtime rather
than repeated in domain inputs. Candidate dimensions include:

1. one execution, correlation, and causation identity;
2. authenticated Principal and effective authority scope;
3. host channel and Session identity;
4. a client-instance or surface identity, such as one browser tab or CLI process;
5. Operation, Task, Program Run, and Interaction identities when present;
6. Unit Of Work and transaction scope;
7. selected Resource binding and attempt identity.

These identities remain distinct. Two browser tabs may share an authenticated Session while having
different client-instance context. One CLI login may initiate several unrelated command sessions.
One Session may contain several concurrent Program Runs, and one Operation Run may contain several
Resource attempts or Interactions. Correlation relates them without declaring them identical.

The execution context should be ambient only inside trusted runtime composition. Portable Commands,
Operation inputs, Entity values, and model output must not be able to mint a Principal, accounting
owner, broader policy scope, or privileged correlation identity.

## Evidence Planes

One semantic execution can produce several projections that must not collapse:

1. **Telemetry** explains technical behavior such as latency, retries, transport, and runtime
   health. It may be sampled, aggregated, bounded, or short-lived.
2. **Audit evidence** explains who or what performed a semantically relevant action, against which
   subject, under which decision, and with which outcome. Retention is selective and host-owned.
3. **Domain Events** announce declared application facts for reaction or integration. They are not
   a generic telemetry or audit stream.

The same committed mutation may inform all three, but each projection has a different contract and
audience. A model request can produce telemetry and Resource usage evidence without producing a
Domain Event. An Entity creation can produce committed mutation evidence and a declared Event
without requiring permanent storage of every trace or diagnostic payload.

The [[ontahi.model.unit-of-work|Unit Of Work]] is a relevant commitment boundary. Evidence that
claims an Entity change occurred must follow successful commit; rejected or rolled-back mutation
intents are not committed state history. Its current post-commit Event queue proves ordering but
does not yet provide an atomic durable audit log or outbox.

## Optional Retention And Adapters

Ontahí should make semantic evidence observable without requiring every application to provision an
audit database. A host may choose independently among:

1. no retained audit evidence;
2. bounded in-memory evidence for development;
3. telemetry export with sampling or aggregation;
4. selective durable audit storage;
5. projection into an existing governance, SIEM, observability, or compliance product;
6. declared Domain Event publication for integration.

Retention, redaction, field-level change capture, sampling, and export destination are policies or
adapter choices. They must not be hidden consequences of declaring an Entity, Operation, Resource,
or Interaction. Devtools diagnostics remain bounded local evidence, not an audit database.

## Language Horizon

A future Ontahí language may give Entity, Operation, Resource, and Interaction declaration syntax
comparable to a language's types and functions. Cross-cutting concerns may then be attached through
annotations, traits, policies, selectors, or bindings. Syntax must follow semantic proofs; it must
not lead them.

A plausible future program should be able to state that an Operation consumes a Resource, may
request an Interaction, affects Entities, and is subject to governance without embedding a provider,
UI component, database, or telemetry vendor in its domain contract. This item does not yet select
the declaration or trait mechanism.

## Boundaries And Open Shape

1. Resource here means a semantic capability or consumable participating in execution. It must be
   reconciled with environment capability bindings and live scoped resources from Plan 120.
2. Session, Program Run, Task Run, Operation Run, Unit Of Work, transport connection, and client
   instance remain separate lifecycle concepts.
3. Audit records are not automatically Entities. A host may store them as rows or documents without
   making them part of the application's ordinary domain graph.
4. Domain Events remain declared application facts, not an automatic mirror of every lifecycle
   transition or metric.
5. Governance must remain explainable: the effective decision, contributing policies, subject,
   context, and enforcement owner should be inspectable without disclosing secrets.
6. Evidence and policy adapters may be local, remote, durable, sampled, or absent. Their guarantees
   must be advertised rather than inferred from a common API name.

Plan 158 owns the first research and context-propagation proof. Plan 125a remains the concrete
Resource-governance pressure test through model usage. Plan 153a owns model-mediated authority and
disclosure hardening. Plan 154 owns the broader relationship among Sessions, participants, Program
Runs, evaluation, and distributed runtimes.

The current implemented identity inventory is recorded in
[`Semantic execution identity and context map`](../../../docs/research/semantic-execution-identity-and-context-map.md).
It establishes that causal execution context has uses beyond governance: debugging, Interaction
correctness, telemetry, audit projection, Event causation, and distributed continuation all need to
relate existing local identities. Client surface and instance identity remain provenance with
explicit trust, never authority by themselves.

Plan 158a implements the first bounded causal-lineage proof. A runtime-owned root execution derives
separate Operation or Intent Resolution ownership and one identity per model Resource attempt.
Normalized usage projects that safe lineage to Devtools, including receiver-admitted channel,
surface and client-instance provenance. The proof deliberately has no durable audit store and does
not yet preserve lineage across process restart or remote Task continuation.
