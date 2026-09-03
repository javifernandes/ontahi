# 120. Ontahi Environment Resources And Semantic Bindings

Status: next

Canonical ID: `ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings`

Migrated from: `bookops://plans/120-ontahi-environment-resources-and-semantic-bindings`
Original path: `plans/next/120-ontahi-environment-resources-and-semantic-bindings.md`
Source commit: `cb9c038a`

Definition level: research-shaped

Source plan: [100. Ontahi Framework Extraction](../done/100-ontahi-framework-extraction.md)

## Summary

Explore how an Ontahi application assigns environment capabilities to semantic parts of its model without repeating technology choices on every entity or operation.

The motivating examples are small but expose a larger design surface:

```ts
ingress: app.ingress.http({
  provider: 'express',
  channel: 'todo.complete-all',
});

durable: {
  runtime: 'in-process',
}
```

Those declarations mix an operation's semantic needs with host technology selection. The desired direction resembles selectors, aspects, and a cascade: a resource binding selects model declarations and supplies a capability implementation, while the declarations retain only irreducible semantic properties.

This plan should make the problem visible before standardizing an API. It is not yet a commitment to a universal resource model or deployment DSL.

## Context

The Todo Express portability example proved that the same Ontahi application can run outside BookOps and Next.js. It also made repeated host decisions conspicuous:

1. each HTTP-exposed operation can name `provider: 'express'`,
2. each durable operation can name `runtime: 'in-process'`,
3. entity storage choices live elsewhere and follow a different composition path,
4. telemetry, identity, cache, clocks, and task storage have their own registration shapes,
5. none of those choices inherently belongs to one operation's domain meaning.

The pressure is broader than dependency injection. A useful model may need to connect:

1. semantic declarations and selections,
2. required capabilities and their guarantees,
3. host-provided adapters and named instances,
4. binding precedence, composition, and conflicts,
5. runtime resources and lifecycle scopes,
6. generated deployment evidence or infrastructure projections.

CSS is a useful analogy, not a prescribed implementation. Selectors separate what is targeted from what is supplied; specificity and cascade make broad defaults coexist with narrow overrides. Aspect-oriented systems offer another analogy for cross-cutting bindings. Both also warn that implicit resolution can become difficult to inspect.

## Existing Evidence

This work starts from existing Ontahi decisions rather than inventing a second architecture:

1. [Runtime Capability Model](ontahi://atlas/application-architecture-surface/runtime-capabilities)
2. [100e. Ontahi Runtime Capabilities And Repository Topology](../done/100e-ontahi-runtime-capabilities-and-repository-topology.md)
3. [72. Graph HTTP Ingress And Provider Adapters](bookops://plans/72-graph-http-ingress-and-provider-adapters)
4. [64. Hierarchical Server Runtime Resources](bookops://plans/64-hierarchical-server-runtime-resources)
5. [68h. Runtime Context Resources And Cache API](bookops://plans/68h-runtime-context-resources-and-cache-api)
6. [74a. Unit Of Work Runtime Scope](../done/74a-unit-of-work-runtime-scope.md)
7. [112. Ontahi Capability Package Composition v0](./112-ontahi-capability-package-composition-v0.md)
8. the Todo Express portability example,
9. BookOps bindings for Supabase, durable workflows, HTTP ingress, and observability.

The term `resource` currently covers at least two different layers:

1. an environment capability or configured adapter available to the application,
2. a live value or session scoped to a request, operation, or unit of work.

This plan must relate those layers without collapsing them. Plan 68h and plan 74a continue to own runtime context and lifecycle semantics.

## Current HTTP Ingress Evidence

The developer-book inventory sharpened the HTTP case:

1. the generic Fetch/Express/Next.js bridge carries `{ operationId, input }` through one canonical
   dispatcher;
2. `ingress.http(...)` separately reflects method, route, provider, and channel on one operation;
3. BookOps routes GitHub `push` and `installation.deleted` through the same URL to different
   operations by normalized channel;
4. the provider verifies the raw signature, parses provider payloads, and returns
   accepted/ignored/rejected before operation dispatch;
5. `ontahiExpress(...)` now derives reflected routes and the canonical dispatcher from the
   application when the host supplies an ingress provider registry; Next.js and future HTTP hosts
   still need equivalent adapter-level composition;
6. the Express adapter and Fetch client share an explicit `mountPath`, avoiding global discovery
   while allowing several Ontahi runtimes to coexist under different host roots;
7. the Todo declaration still names `express` even though runtime technology selection does not
   belong to enduring operation meaning;
8. delivery identity is currently often carried in operation input rather than invocation context,
   while transport deduplication and operation idempotency remain separate unresolved guarantees.

This confirms that bridge transport, semantic ingress metadata, provider decoding, resource
binding, and delivery context must not collapse into one generic "HTTP endpoint" abstraction.
The adapter can remove mounting ceremony without deciding the larger semantic resource-binding
model.

## Research Questions

### Semantic declaration

1. What is irreducible semantic metadata on an entity or operation?
2. Should an operation declare a requirement such as `durable`, `http`, or `transactional`, without choosing an adapter?
3. Are requirements capabilities, constraints, annotations, traits, or another concept?
4. Which facts must remain local because moving them into a binding would hide domain meaning?

### Selection and binding

1. Can bindings target entity and operation selections using the same model vocabulary already used by Ontahi?
2. What selectors are necessary: explicit refs, capability predicates, namespaces, packages, annotations, or structural queries?
3. How do broad defaults and narrow overrides compose?
4. How are ambiguity, missing bindings, incompatible guarantees, and accidental shadowing reported?
5. Can reflection explain why a declaration received a resource?

### Resources and guarantees

1. Is a resource a capability contract, a configured adapter instance, a deployment unit, or a composition of those?
2. How are named instances represented, such as two PostgreSQL databases or two HTTP servers?
3. How do graph storage, durable execution state, task run storage, caching, messaging, telemetry, identity, secrets, clocks, and schedulers differ?
4. Which resources may satisfy multiple capabilities without erasing their different guarantees?
5. Where do lifecycle and scope enter: process, request, operation, unit of work, transaction, tenant?

### Hosting and deployment

1. Does an HTTP operation declare a semantic route/channel while a host binding chooses Express, Next.js, or another server?
2. Can resource bindings produce a host composition graph that codegen and deployment tooling consume?
3. Where is the boundary between Ontahi application declarations and Terraform, Docker, Kubernetes, Vercel, or another deployment system?
4. Should Ontahi emit requirements and topology evidence rather than attempt to own infrastructure provisioning?
5. How are credentials, secrets, migrations, networking, and regional constraints referenced without leaking them into the semantic model?

## Scope

The plan includes:

1. inventorying concrete binding sites across the Todo example and BookOps,
2. classifying semantic requirements, capability contracts, adapter instances, and live scoped resources,
3. comparing at least three candidate composition models,
4. defining resolution and explainability requirements before syntax,
5. testing the model against multiple servers, multiple stores, and mixed durable runtimes,
6. locating the boundary with deployment and infrastructure-as-code,
7. building one narrow executable spike only after the model survives the cases.

## Non-Goals

1. Do not implement Terraform, Docker, Kubernetes, or a cloud control plane.
2. Do not define a universal ontology for every infrastructure resource.
3. Do not replace runtime context or Unit of Work scope with a static binding registry.
4. Do not make CSS syntax itself a requirement.
5. Do not hide security, durability, consistency, or transaction guarantees behind interchangeable adapters.
6. Do not migrate every existing adapter during the research phase.
7. Do not require every application to use generated infrastructure.

## Candidate Models To Compare

At minimum, compare:

1. **Explicit capability requirements plus host bindings**
   - declarations state needs,
   - the host maps those needs to adapter instances.
2. **Selector-based aspects**
   - bindings select reflected model elements,
   - broad defaults and explicit overrides compose through defined rules.
3. **Package/resource manifests**
   - capability packages publish requirements,
   - the application or deployment host satisfies them during composition.

A hybrid may be correct. The comparison should prioritize inspectability and failure behavior over terse syntax.

## Evidence Scenarios

The model is not ready until it can explain these cases:

1. the Todo app exposes all public operations through one Express server without repeating `express`,
2. one operation overrides the default route or is not HTTP-exposed,
3. Todo entities use an in-memory store in development and PostgreSQL in production,
4. entity groups A/B/C use one named store while D/E use another,
5. most durable operations use one runtime while a selected subset uses another,
6. durable execution state and authoritative graph state use different resources,
7. two HTTP servers coexist in one process or deployment,
8. a capability package contributes operations but the consuming app chooses storage and ingress,
9. reflection reports the selected resource, originating binding, overridden candidates, and unmet requirements,
10. deployment tooling can read the resolved topology without becoming the authority for domain semantics.

## Execution Slices

1. **Evidence inventory**
   - enumerate current declarations, registries, adapters, and host bootstrap code,
   - record what each site selects, configures, and instantiates.
2. **Vocabulary and invariants**
   - distinguish requirement, capability, binding, adapter instance, live resource, scope, and deployment projection,
   - document guarantees that must remain visible.
3. **Model comparison**
   - express the evidence scenarios in at least three candidate models,
   - evaluate locality, repetition, ambiguity, tooling, testability, and migration cost.
4. **Resolution semantics**
   - define matching, precedence, conflicts, defaults, overrides, and validation,
   - design an explanation trace before optimizing syntax.
5. **Deployment boundary**
   - describe the resolved application topology and what external tooling may project from it,
   - explicitly assign ownership of secrets, migrations, networking, and provisioning.
6. **Narrow spike**
   - remove repeated Express and in-process durable choices from the Todo example,
   - preserve equivalent reflection, codegen, runtime behavior, and diagnostics.
7. **Decision**
   - update the Runtime Capability Model and split implementation plans only after the spike yields evidence.

## Verification

- [ ] Existing resource and adapter composition sites are inventoried with concrete code references.
- [ ] The vocabulary distinguishes environment bindings from live runtime-scoped resources.
- [ ] Candidate models are compared using the same evidence scenarios.
- [ ] Multiple providers and named resource instances have deterministic semantics.
- [ ] Missing, ambiguous, and incompatible bindings fail with actionable diagnostics.
- [ ] Reflection can explain the effective binding of an entity or operation.
- [ ] The Todo spike removes repeated technology choices without hiding semantic exposure or durability.
- [ ] The deployment boundary is documented without committing Ontahi to provisioning infrastructure.
- [ ] Follow-up implementation plans are smaller and evidence-backed.

## Provisional Design Constraints

These are constraints to test, not a settled API:

1. semantic declarations should say what they require, not which npm package implements it,
2. technology adapters belong to host composition,
3. broad defaults must allow explicit local exceptions,
4. resolution must be deterministic and explainable,
5. resource guarantees remain visible and mechanically validated,
6. the resolved model should be useful to runtime bootstrap, codegen, Explorer, tests, and deployment tooling,
7. deployment projections consume the application model; they do not become the domain model.

## Expected Outputs

1. an evidence map of current composition mechanisms,
2. a vocabulary and boundary decision record,
3. competing API sketches applied to real cases,
4. resolution and diagnostic semantics,
5. one Todo-based executable spike,
6. updates to the Atlas Runtime Capability Model,
7. scoped implementation plans for any model that survives the spike.

## Open Questions

1. Is `resource` the right public word, or only the host/runtime implementation word?
2. Should selectors reuse Ontahi `Selection`, use reflected declaration predicates, or form a separate language?
3. Are bindings part of the application model, host model, deployment model, or a composition layer joining them?
4. Can specificity remain simple enough to avoid a hidden dependency-injection container?
5. How does a reusable capability package express requirements without constraining its consumer's topology?
6. Which bindings must be statically resolvable and which may depend on runtime tenant or request context?

## Closure / Evolution

Not started.

The first milestone is understanding and comparison, not API implementation. If the evidence reveals several independent problems, this plan should split them rather than force one abstraction to cover storage, ingress, durable execution, runtime scope, and deployment.
