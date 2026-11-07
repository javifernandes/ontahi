# 166. Semantic Operation Receivers And Bound Invocation

Status: research

Canonical ID: `ontahi://plans/166-semantic-operation-receivers-and-bound-invocation`

Shapes: [Domain Operation](../../atlas/items/model/domain-operation.md),
[Operation Invocation](../../atlas/items/model/operation-invocation.md), and
[Semantic Program Kernel](../../atlas/items/model/semantic-program-kernel.md).

Related plans:

1. [154. Semantic Program Kernel And Distributed Evaluation](154-semantic-program-kernel-and-distributed-evaluation.md)
2. [163. Operation Implementation Bindings And Variants](../current/163-operation-implementation-bindings-and-variants.md)
3. [165. Contextual Resource Bindings And Reusable Configuration Modules](../current/165-contextual-resource-bindings-and-reusable-configuration-modules.md)
4. [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)
5. [146i. Runtime Protocol Negotiation And Conformance](../backlog/146i-runtime-protocol-negotiation-and-conformance.md)
6. [142h. Distributed Execution Topologies](../backlog/142h-distributed-execution-topologies.md)
7. [160. Semantic Modules, Composition, And System Boundaries](160-semantic-modules-composition-and-system-boundaries.md)

## Summary

Investigate every Domain Operation as an effectful function applied to an explicit typed semantic
receiver and ordinary input:

```text
Operation<R, I, O, F> = (receiver: R, input: I) -> Effect<O, F>
```

An Entity definition can receive type-level behavior such as `Workspace.create(...)`; an Entity Ref
can receive instance behavior such as `workspace.askPlans(...)`; and a Selection can receive
collective behavior such as `plans.archive(...)`. Method-like syntax is partial application of the
receiver to this canonical function. It does not require mutable language objects, hidden ambient
state, or a second invocation model.

This research pauses the higher-level contextual Resource API because receiver identity may supply
the missing semantic root from which application scope is derived. It must first establish the
Operation model, public API projections, Runtime Protocol representation, authority boundary, and
migration story. Resource selection and Governance then compose with that model rather than
defining it.

## Why A Type Receiver Is Preferable To “No Receiver”

Treating type-level Operations as receiverless preserves a Java-like static-method exception in the
semantic model. Ontahí already has addressable Entity definitions. Making that definition the
receiver gives one rule:

> Every Domain Operation is invoked against a declared semantic receiver.

The rule is closer to class objects in Smalltalk or Ruby without requiring their runtime object
model. It makes ownership, discovery, reflection, protocol transport, and method projection
uniform. A truly application-wide behavior should investigate an Application or Module receiver
rather than silently falling back to a receiverless global function.

This is a hypothesis, not a requirement to attach every function to an arbitrary Entity. Operations
with several symmetric participants and behavior that belongs to no existing semantic subject are
pressure tests. The research may justify another explicit receiver form, but absence of design
should not become an implicit global namespace.

## Candidate Receiver Algebra

| Receiver form         | Meaning                                        | Example                                         |
| --------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Entity type           | One registered Entity definition               | `Workspace.create({ name })`                    |
| Entity Ref            | One identified Entity instance                 | `workspace.askPlans({ question })`              |
| Selection             | A typed set or deferred selection              | `overduePlans.archive({ reason })`              |
| Module or Application | Behavior owned by a composed semantic boundary | Candidate for genuinely system-level Operations |

The receiver is a distinguished semantic participant, not:

1. the authenticated Principal;
2. a JavaScript implementation object or hydrated mutable record;
3. an ambient workspace/session variable;
4. the selected Operation implementation;
5. an arbitrary field duplicated inside ordinary input.

Other participants remain explicit input. A receiver does not erase functional composition or make
every binary relation asymmetrical by fiat.

## Bound Syntax And Functional Semantics

The same Operation should support several projections without acquiring several meanings:

```ts
workspace.askPlans({ question });

invoke(AtlasWorkspace.askPlans, {
  receiver: workspace,
  input: { question },
});

useOperation(AtlasWorkspace.askPlans, { receiver: workspace });
```

Conceptually, the first and third forms use `bindReceiver(operation, receiver)`. React may retain a
Ref in component state and return a bound callback; it need not retain a live domain object. A CLI
command such as `use workspace acme` may similarly establish frontend/session partial application,
then lower every command to an explicit receiver-bound invocation.

Ambient Invocation Context remains necessary for Principal, trace and causal identity, interaction
origin, cancellation, UnitOfWork, transaction, and trusted host capabilities. Those concerns must
not be smuggled into receiver identity.

## Canonical Invocation And Runtime Protocol

The protocol thesis survives. Transport-independent invocation still carries one semantic request
across Fetch, WebSocket, queues, workflows, and runtime bridges. The candidate closed request makes
the receiver explicit:

```ts
type OperationReceiver =
  | { kind: 'entity-type'; entityName: string }
  | { kind: 'entity-ref'; entityName: string; ref: Record<string, unknown> }
  | { kind: 'selection'; entityName: string; selection: unknown }
  | { kind: 'module-ref'; moduleName: string };

type OperationInvokeRequest = {
  operationId: string;
  receiver: OperationReceiver;
  input: unknown;
};
```

This is provisional wire vocabulary. Research must determine whether current Entity-qualified
Operation identities already imply an Entity-type receiver, how existing Ref-in-input Operations
migrate, which receiver forms are portable, and whether a protocol version gate is required. A
remote runtime receives the same receiver identity and either evaluates, routes, or rejects it; it
does not need the originating TypeScript facade.

Receiver dispatch and implementation dispatch are orthogonal. The receiver says what semantic
subject receives the request. Plan 163's binding says which code, model, external service, or remote
runtime implements it in one environment.

## Receiver, Scope, Resources, And Governance

Receiver-derived scope should be an explicit composition, not an automatic traversal of arbitrary
Relations:

```text
receiver
  -> declared semantic scope projection
  -> configured Resource binding
  -> governed Resource attempt
```

For example:

1. `workspace.askPlans(...)` can project its Workspace receiver directly to model configuration;
2. `plan.draftPR(...)` can use a declared `Plan -> Workspace` scope projection;
3. `item.suggest(...)` can compose `Item -> Plan -> Workspace` when the application explicitly
   names that path;
4. none of these Relations grants authority or proves ownership merely by existing.

A Resource is a named capability or consumable dependency required by an implementation: a model,
paid HTTP service, search index, queue, storage capability, or similar boundary. A Resource binding
selects an effective configured instance for trusted scope. Governance decides admission, quotas,
budgets, rate limits, accounting, and safe evidence per attempt. Authorization decides whether the
Principal may invoke the Operation or use/configure the Resource. These are related policies, not
one concept.

Plan 165's low-level `InvocationContext` binding registry and cache remain useful infrastructure.
Its higher-level authoring form and general scope contract wait for this plan to decide how an
Operation exposes its receiver and declared scope projections.

## Impact Inventory

Research must trace the receiver through:

1. Domain Operation declarations, grouping, reflection, and resolved application graphs;
2. server facades, generated clients, browser clients, and React hooks;
3. Runtime Protocol requests, versioning, routing, and multi-language conformance;
4. input validation, receiver validation/materialization, and result contracts;
5. authority requirements and future authorization without trusting caller-selected identity;
6. Selections, cardinality rules, bulk effects, and collective failures;
7. implementation binding, retry attempts, idempotency keys, durable execution, and cache identity;
8. Interactions, model proposals, partial applications, and resumed invocations;
9. Activity, Devtools, audit evidence, trace origin, and disclosure policy;
10. Modules, cross-Module Relations, and distributed execution topology.

## Evidence Scenarios

1. `Workspace.create` uses the Workspace definition as receiver and returns a new Ref.
2. Atlas `workspace.askPlans({ question })` removes the redundant Workspace field from input.
3. `plan.draftPR({ instructions })` derives a Workspace-scoped model Resource through one declared
   relation without accepting provider configuration from the caller.
4. `selectionOf(Plan).archive(...)` states cardinality, authority, partial-failure, and evidence
   semantics honestly.
5. A generated client and React hook expose bound affordances while sending one canonical request.
6. A remote or alternate-language runtime receives the portable receiver and preserves Operation
   identity, authority, implementation evidence, and result semantics.
7. The same receiver-bound Operation changes from a model implementation to code without changing
   callers or its contract.

## Questions To Resolve Before Implementation

1. Is receiver kind declared explicitly, inferred from placement in an Entity/Module declaration,
   or both with one canonical lowering?
2. Is an Entity Ref transported directly, materialized before execution, or available through a
   receiver API analogous to `existingRef`?
3. What does Selection receiver cardinality mean for atomicity, authorization, partial failure,
   retries, and idempotency?
4. Which semantic owner receives behavior that has several symmetric participants or no natural
   Entity owner?
5. Can Module/Application receivers remain stable across composition and federation?
6. How are legacy Operations whose target Ref is embedded in input migrated without ambiguous
   duplicate identity?
7. Which parts of receiver identity are safe to expose in clients, Activity, audit, and Devtools?
8. How does a receiver participate in open Program applications and typed substitution?

## Execution Slices

1. **Inventory and algebra** — classify current Operations by candidate receiver and record
   counterexamples rather than designing from one Atlas use case.
2. **Protocol and authority mapping** — specify portable forms, migration, trust boundaries, and
   remote-runtime behavior without changing the current wire contract.
3. **API comparison** — compare explicit receiver declarations, placement-derived declarations,
   facade binding, and functional invocation across server, browser, React, CLI, and generated code.
4. **Selection and lifecycle pressure test** — cover bulk behavior, retries, durability,
   interactions, identity, and evidence.
5. **Resource composition** — refine Plan 165 using declared receiver-to-scope projection and prove
   that Governance remains independent.
6. **Implementation proposal** — only after the prior decisions, extract a bounded executable plan
   with compatibility and release strategy.

## Non-Goals

1. Do not implement or publish a receiver API in this research plan.
2. Do not introduce mutable domain objects, identity maps, or active-record persistence.
3. Do not force every Operation onto an arbitrary Entity to preserve visual method syntax.
4. Do not infer scope, ownership, tenancy, or authorization from arbitrary Relations.
5. Do not redesign Authorization before its dedicated state-of-the-art research.
6. Do not break Runtime Protocol or remove existing Ref inputs before a migration is proven.
7. Do not let the Atlas application or model Resources dictate a universal Workspace abstraction.

## Acceptance

- [ ] Current Operations are classified against the candidate receiver algebra, including genuine counterexamples.
- [ ] Receiver, Principal, input participant, ambient context, implementation, Resource, and scope have non-overlapping meanings.
- [ ] One canonical functional semantics explains entity-type, instance, Selection, and bound method projections.
- [ ] Runtime Protocol representation, trust boundary, compatibility, and multi-runtime routing are specified.
- [ ] Server, generated-client, React, CLI, reflection, Devtools, durable, and model-backed impacts are mapped.
- [ ] Selection receiver semantics are honest about cardinality, authority, effects, retries, and partial failure.
- [ ] Receiver-derived scope composes with Resource binding without granting authority or hiding relation traversal.
- [ ] A bounded implementation plan is extracted only after the architectural decisions are recorded.
