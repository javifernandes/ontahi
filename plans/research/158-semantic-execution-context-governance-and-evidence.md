# 158. Semantic Execution Context, Governance And Evidence

Status: research

Canonical ID: `ontahi://plans/158-semantic-execution-context-governance-and-evidence`

Shapes: [Semantic Subjects And Runtime Concerns](../../atlas/items/model/semantic-subjects-and-runtime-concerns.md),
[Unit Of Work](../../atlas/items/model/unit-of-work.md),
[Authority And Policies](../../atlas/items/authority-and-policies.md).

Research evidence:
[Semantic Execution Identity And Context Map](../../docs/research/semantic-execution-identity-and-context-map.md).

Related plans:

1. [158a. Semantic Execution Context Propagation Proof](../done/158a-semantic-execution-context-propagation-proof.md)
2. [125a. Model Execution Resource Governance](../current/125a-model-execution-resource-governance.md)
3. [153a. Model Execution Security And Authorization](../backlog/153a-model-execution-security-and-authorization.md)
4. [154. Semantic Program Kernel And Distributed Evaluation](./154-semantic-program-kernel-and-distributed-evaluation.md)
5. [120. Environment Resources And Semantic Bindings](../next/120-ontahi-environment-resources-and-semantic-bindings.md)
6. [130. Authentication, Principal And Invocation Context](../done/130-ontahi-authentication-principal-and-invocation-context.md)
7. [139b. Transaction-Scoped Unit Of Work](../done/139b-transaction-scoped-unit-of-work.md)
8. [146j. First-Class Events And Configurable Event Runtime](../done/146j-first-class-events-runtime-protocol-gate.md)
9. [154d. Semantic Mutation Journal And Query Invalidation](../done/154d-semantic-mutation-journal-and-query-invalidation.md)

## Summary

Investigate a shared semantic execution context and cross-cutting concern model for Ontahí's
first-level subjects: Entity, Operation, Resource, and Interaction. The research should explain how
authorization, governance, audit evidence, telemetry, and Domain Events relate to those subjects
without collapsing them into one universal object, one mandatory storage system, or one opaque
policy engine.

The immediate evidence comes from model Resource usage. Provider adapters now report normalized
usage for model-backed Operations and Intent Resolution, and Devtools can display it. That evidence
lacks a stable semantic activity identity beyond its response, has no durable accounting owner, and
does not answer which Session, browser tab, CLI invocation, Principal, Operation Run, or policy
caused the attempt. Solving that attribution narrowly exposes a broader runtime context needed by
audit, observability, authorization, Interactions, Events, and distributed execution.

The research thesis is:

> Entity, Operation, Resource, and Interaction are distinct semantic subjects. Governance and
> auditability are related concerns over those subjects. A trusted execution context relates their
> evidence without erasing their different meaning or forcing retention.

## Why This Is Not An Audit Database Plan

Ontahí must not make durable storage proportional to every runtime action an unavoidable framework
cost. The fixed capability should be the production of bounded, typed semantic evidence at truthful
lifecycle boundaries. A host chooses whether and how that evidence is retained:

1. disabled or no-op;
2. bounded in-memory diagnostics;
3. sampled or aggregated telemetry export;
4. selective durable audit storage;
5. an external governance, observability, or compliance sink;
6. a declared Domain Event when an application fact warrants integration.

Retention policy must define subject selection, evidence level, redaction, payload limits, duration,
and destination. Declaring an Entity or Operation must not silently enable full value snapshots,
unbounded append-only history, prompt retention, or model-response retention.

## Provisional Metamodel

The research starts with four semantic subjects:

| Subject     | Stable meaning                              | Candidate lifecycle evidence                       |
| ----------- | ------------------------------------------- | -------------------------------------------------- |
| Entity      | identifiable domain state and relationships | created, changed, deleted, related                 |
| Operation   | contracted application action               | requested, admitted, started, completed, failed    |
| Resource    | capability or consumable used by execution  | selected, reserved, consumed, exhausted, released  |
| Interaction | typed request/response with a participant   | requested, presented, answered, expired, cancelled |

These are candidate future language nouns. They may eventually receive first-class declaration
syntax just as languages distinguish data types and functions. This plan does not define that syntax
or require one inheritance hierarchy.

Candidate concerns include:

1. `governable`: admission, authorization, limits, approval, routing, disclosure, retention, and
   continuation decisions;
2. `auditable`: required evidence level, redaction, retention class, and disclosure audience;
3. `observable`: technical signals, traces, measurements, and diagnostic correlation;
4. `reflectable`: safe static declarations and effective runtime decisions available to tools;
5. `localizable`: participant-facing labels, prompts, explanations, and policy messages.

Only `governable` and `auditable` are central to this plan. The others test whether the subject /
concern distinction is coherent. A concern becomes a shared contract only after multiple subject
kinds prove compatible semantics and enforcement points.

## Semantic Execution Context

Define the minimum trusted context needed to attribute decisions and evidence. Candidate dimensions
are:

```ts
type SemanticExecutionContext = {
  executionId: string;
  correlationId: string;
  causationId?: string;
  principal?: Principal;
  session?: {
    id: string;
    channel: 'web' | 'cli' | 'agent' | 'system';
    clientInstanceId?: string;
  };
  programRun?: { id: string };
  operation?: { id: string; runId?: string };
  interaction?: { id: string };
  resourceAttempt?: { id: string; binding?: string };
};
```

This is explanatory pseudocode, not an accepted public API. The research must determine which
identities already exist, which can be composed, and which require new stable contracts.
The final design may expose these identities through separate trusted projections instead of
carrying every identity directly on one public context object. A policy evaluator, evidence sink,
transport, and developer tool may each require a different safe subset of the same causal context.

The following must remain distinct:

1. authenticated Session and Principal;
2. browser tab, window, device, CLI process, agent channel, or other client instance;
3. conversation or participant Session;
4. Program Run, Task Run, and Operation Run;
5. Interaction identity and claimant;
6. Unit Of Work and transaction scope;
7. transport exchange or connection;
8. Resource binding, attempt, retry, and provider request.

For example, several tabs can share one login Session while carrying different selected Entity
context. A CLI login can initiate several independent invocations. One Operation Run can perform
several charged model attempts. Correlation must express those relationships without treating any
two identities as interchangeable.

Client-instance identity introduces privacy, spoofing, cardinality, and lifecycle questions. It may
be useful for diagnostics and interaction routing without being an authorization identity. A tab ID
supplied by an untrusted browser cannot grant authority or select its own accounting owner.

## Governance

Governance is broader than authorization and broader than Resource limits. A decision pipeline may
eventually answer:

1. may this Principal perform this action over this scope?
2. must another participant approve it?
3. which implementation or Resource binding may execute it?
4. which time, request, concurrency, token, or cost envelope applies?
5. which data may be disclosed to the selected Resource?
6. what evidence must be captured, redacted, retained, or exported?
7. may an Interaction be presented or answered by this participant?

Authorization, approval, routing, Resource policy, disclosure, and audit policy must retain distinct
outcomes and enforcement owners. They may share context and explanation machinery. A budget does not
grant Entity or Operation authority; authorization does not guarantee capacity; an audit policy does
not by itself block execution unless a host explicitly requires durable evidence before admission.

The plan must compare at least two composition forms:

1. one ordered decision pipeline with typed stages;
2. independent concern evaluators that produce a combined immutable execution envelope.

The comparison must prioritize inspectability, deterministic precedence, failure semantics, and the
ability of a narrower scope to restrict but never widen a host boundary.

## Audit Evidence

Audit evidence is a selective semantic account, not raw logging. A common envelope may contain:

1. evidence identity, time, execution, correlation, and causation;
2. semantic subject kind and stable subject identity;
3. Principal, Session, client instance, and run identities when safely available;
4. action or lifecycle transition;
5. outcome and responsible enforcement owner;
6. redacted subject-specific evidence.

Subject payloads remain distinct:

1. Entity evidence may contain mutation kind, affected identity, and permitted before/after or diff
   fields;
2. Operation evidence may contain contract identity, admitted execution envelope, outcome, and typed
   failure category;
3. Resource evidence may contain provider/binding identity, attempts, measurements, evidence
   quality, limits, and exhaustion;
4. Interaction evidence may contain request kind, participant/claimant identity, response outcome,
   expiry, and proposal identity without retaining private presentation content by default.

The existing Unit Of Work mutation journal is a source for committed Entity-change evidence. It is
intensional and designed for dependency invalidation, not yet a complete audit diff. The existing
model usage record is a source for Resource evidence. Durable Task snapshots are a source for
Operation and Interaction lifecycle evidence. The research should compose these sources rather
than introduce a parallel execution history.

## Telemetry, Audit And Events

Keep three projections explicit:

| Projection     | Purpose                                            | Typical guarantee                   |
| -------------- | -------------------------------------------------- | ----------------------------------- |
| Telemetry      | technical behavior and health                      | sampled, aggregated, bounded, lossy |
| Audit evidence | accountable semantic action and decision           | selective, policy-defined retention |
| Domain Event   | declared application fact for reaction/integration | declaration and adapter guarantees  |

An internal semantic fact may feed several projections, but the projections must not share one
undifferentiated payload or retention promise.

Events integrate naturally at the commitment and distribution boundary. A successfully committed
Entity mutation or completed Operation may cause a declared Domain Event. The Unit Of Work already
queues typed Event emissions until commit. Future durable audit/outbox work may share a transaction
adapter or causal envelope, but an automatic Event for every metric, policy decision, or lifecycle
transition would pollute the domain language and impose unnecessary storage and delivery cost.

The research must distinguish:

1. internal runtime facts used to derive diagnostics or evidence;
2. durable audit records selected by policy;
3. declared Event Occurrences selected by application semantics;
4. transport and provider telemetry exported by adapters.

## Evidence Scenarios

Use the same model to explain at least these cases:

1. Two browser tabs share one authenticated user but hold different selected Todo Lists; an
   Interaction initiated in one tab must not be answered implicitly from the other.
2. Two CLI processes share credentials but initiate unrelated Operation Runs and diagnostic streams.
3. One model-backed Operation performs two provider attempts because of retry; both attempts are
   attributed to one Operation Run and counted independently.
4. Intent Resolution consumes the same model Resource without pretending to be a Domain Operation.
5. An Entity update commits, refreshes affected observations, emits one declared Domain Event, and
   optionally records an audit diff without treating those outputs as the same artifact.
6. A transaction rolls back after producing mutation intents and telemetry; no evidence may claim
   that the Entity state committed and no post-commit Event may occur.
7. An approval Interaction is presented in web Devtools and answered from an authorized CLI; the
   response retains claimant and surface context while authority is rechecked.
8. A paid non-model API has request and rate limits, proving which Resource-governance concepts are
   genuinely provider-neutral.
9. Audit retention is disabled while Devtools still shows bounded live evidence and governance still
   enforces admission.
10. A regulated Operation requires durable audit acceptance before execution, making that stronger
    guarantee explicit rather than silently assumed for every application.

## First Executable Slice

Do not begin with an audit store or universal policy DSL. Implement one bounded propagation proof:

1. assign or preserve one execution/correlation identity for a top-level model command or Operation;
2. relate existing Session/channel, client-instance, Principal, Operation/Task Run, Unit Of Work, and
   model-attempt identities where they already exist;
3. carry the safe subset to model Resource usage evidence without placing it in Operation input or
   model-visible context;
4. show the correlation and semantic owner in Devtools;
5. retain evidence only in the existing bounded diagnostic store;
6. prove that two tabs or two CLI sessions remain distinguishable while shared authentication does
   not make client-instance identity authoritative.

This slice should establish naming, propagation, trust, and lifecycle boundaries. Durable audit
storage, aggregate quotas, pricing, and a general governance API remain follow-ups.

The initial identity inventory is now captured in the linked research evidence. It finds strong
local identities for Principal, Runtime Protocol exchange, Task Run, Interaction, mutation commit,
Event occurrence/delivery, and telemetry, but no common runtime-owned causal link or stable
UI/CLI-origin projection. The propagation proof should therefore compose those identities and add
the missing execution/correlation link, the runtime-owned causal link from an initiating Interaction
or surface to its Operation, and Resource-attempt identity. It must not replace existing identities
with aliases or promote caller-authored transport, tab, or surface IDs into authority.

## Execution Slices

1. **Inventory existing identities and scopes**
   - map Principal, invocation context, Session, Runtime Protocol request/exchange, Task Run,
     Operation scope, Unit Of Work, mutation outcome, Event occurrence, observation, and model usage;
   - identify generation points, trust owners, propagation gaps, lifetimes, and current consumers.
2. **Define subject and concern vocabulary**
   - test Entity, Operation, Resource, and Interaction against governance, auditability, reflection,
     localization, and observability;
   - reject a shared trait where payload, enforcement, or lifecycle semantics differ materially.
3. **Specify execution context**
   - define identity relationships, trust boundaries, propagation, nesting, correlation, causation,
     cardinality, and redaction;
   - specify browser-tab, CLI, agent, system, nested Operation, retry, and durable-resume behavior.
4. **Separate evidence planes**
   - define internal semantic facts, telemetry, audit evidence, Domain Events, and mutation journals;
   - assign commitment, retention, delivery, and failure semantics to each.
5. **Compare governance composition**
   - apply ordered-pipeline and combined-envelope models to authorization, approval, disclosure,
     Resource limits, routing, and audit requirements;
   - require deterministic narrowing, typed outcomes, and inspectable explanations.
6. **Implement the bounded propagation proof** — tracked concretely by Plan 158a
   - correlate one model-backed Operation and Intent Resolution attempt through existing runtime
     boundaries;
   - display safe semantic ownership and context in Devtools with bounded local retention.
7. **Split follow-ups**
   - update Plan 125a with the proven Resource accounting identity;
   - scope durable audit adapters, Entity change evidence, general Operation governance, and
     cross-surface Interaction routing as separate implementation plans where evidence warrants.

## Acceptance And Verification

- [ ] Entity, Operation, Resource, and Interaction are described as distinct semantic subjects with
      concrete evidence for their different identity and lifecycle semantics.
- [ ] Governance and auditability are defined as related but independent concerns rather than one
      universal trait or service.
- [ ] Existing runtime identities and scopes are inventoried with generation point, trust owner,
      lifetime, propagation, and consumer.
- [ ] Authenticated Session, client instance, participant Session, Program Run, Task/Operation Run,
      Unit Of Work, transport exchange, and Resource attempt remain distinguishable.
- [ ] The execution context cannot be widened or reassigned by Operation input, model output, an
      untrusted tab/CLI identifier, or a nested implementation.
- [ ] Telemetry, audit evidence, mutation journals, and Domain Events have distinct purpose,
      retention, commitment, and delivery semantics.
- [ ] Entity evidence is emitted only after commit; rollback never produces evidence claiming a
      committed state change or a post-commit Event.
- [ ] Audit persistence is optional and adapter-owned; bounded diagnostics and governance work with
      no durable audit store configured.
- [ ] Governance composition preserves distinct authorization, approval, disclosure, Resource,
      routing, and audit outcomes while allowing narrower scopes only to restrict.
- [ ] One model-backed Operation and Intent Resolution attempt carry the same minimal correlation
      envelope while retaining different semantic subject identity.
- [ ] Two browser tabs or CLI sessions sharing authentication remain distinguishable without making
      client-instance identity an authorization credential.
- [ ] Devtools explains the semantic owner, execution correlation, Resource attempt, measurements,
      and outcome without retaining prompts, results, credentials, or private graph context by
      default.
- [ ] At least one non-model paid or rate-limited service tests the provider-neutral Resource
      vocabulary before a generic API is promoted.
- [ ] Follow-up implementation plans separate durable audit storage, Entity change evidence,
      general Operation governance, Resource budgets, and Interaction routing where their guarantees
      differ.

## Non-Goals

1. Do not build a mandatory audit database, event-sourced application model, SIEM, billing system,
   or compliance product.
2. Do not emit a Domain Event for every runtime transition, policy decision, metric, or diagnostic.
3. Do not turn audit records into ordinary application Entities by default.
4. Do not define a universal `SemanticObject` superclass or TypeScript trait hierarchy before the
   subjects prove shared semantics.
5. Do not let telemetry, audit, or Resource policy grant Entity or Operation authority.
6. Do not put Principal, Session, tab, accounting, provider, or budget identity into domain inputs or
   model-controlled output.
7. Do not persist raw prompts, model responses, credentials, private graph context, or complete
   Entity snapshots by default.
8. Do not replace OpenTelemetry, Event brokers, provider billing evidence, or external governance
   products with Ontahí-specific infrastructure.
9. Do not design final language syntax before runtime identity and concern semantics are proven.
10. Do not fold environment Resource binding, live scoped resources, consumption evidence, and
    deployment topology into one unqualified `Resource` concept.

## Expected Outputs

1. an identity-and-scope map of current runtime concepts;
2. a decision record for semantic subjects versus runtime concerns;
3. a minimal trusted execution/correlation envelope;
4. explicit telemetry, audit, Event, and mutation-evidence boundaries;
5. governance composition sketches applied to real scenarios;
6. one bounded Devtools-visible propagation proof without durable audit storage;
7. updates to the affected Atlas items;
8. smaller implementation plans for Resource budgets, durable audit, Entity change evidence,
   Operation governance, and cross-surface Interaction routing.

## Open Questions

1. Is `Resource` a language-level subject, a host binding, a live scoped value, a consumable, or a
   family requiring qualified names?
2. Is there one `SemanticExecutionContext`, or a trusted internal context with several safe
   projections for policy, evidence, transport, and tools?
3. Which identity is stable across retry, durable resume, delegation, and remote execution?
4. Should audit-required execution reserve durable evidence capacity before an effect, use an atomic
   outbox, or fail independently after commit?
5. How much Entity change evidence can be derived from the mutation journal without reading or
   retaining sensitive before/after values?
6. Can governance decisions compose as data without creating an opaque aspect or dependency-
   injection system?
7. Which decisions belong to semantic declarations, host policy, environment bindings, or runtime
   state?
8. When client attribution is required, which ingress admits a client claim or connection as a
   receiver-scoped provenance handle? When may that handle cross reconnection or surfaces, and who
   authorizes an Interaction response from another surface?
9. Which evidence is safe for users, operators, developers, models, and external sinks?
10. What syntax could eventually make the four subjects and their concerns clear without coupling
    the language to one runtime implementation?

## Closure / Evolution

Research newly opened. The first milestone is a trustworthy identity-and-scope inventory, not a
public API. Move the plan to `next` only after the subject/concern distinction and first propagation
slice are concrete enough to implement without introducing mandatory persistence or a universal
governance engine.
