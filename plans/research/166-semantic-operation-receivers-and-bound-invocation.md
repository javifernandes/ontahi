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
| Relation/association  | A relation surface rooted at participants      | `book.collaborators.invite({ user })`           |
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
across Fetch, WebSocket, queues, workflows, and runtime bridges. The initial hypothesis considered
a parallel receiver field:

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

The inventory checkpoint makes that shape less likely. Current Entity-qualified Operation identity
names the Operation owner and can supply a type receiver when the declaration selects that receiver
mode; it does not prove that every Operation on the Entity namespace is type-received. Bound Entity
Ref methods lower the Ref into its declared input position before producing the existing request. A
Selection can use the same lowering. The canonical closed request may therefore remain
`{ operationId, input }`; portable Operation metadata and open Program applications retain receiver
kind and position, while the wire carries no duplicate identity.

Research must compare both projections explicitly. A separate wire receiver is justified only if
routing, authority, or evaluation cannot recover the same unambiguous meaning from portable
Operation metadata plus validated input. A remote runtime never needs the originating TypeScript
facade, but it may need the receiver-position declaration in reflected Operation metadata.

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

## Inventory Checkpoint — 2026-11-07

The repository already implements several pieces of receiver behavior without one canonical model.
The inventory covered executable Todo and Classroom examples, generated client Entities, Core Ref
binding, relation Operations, Explorer reflection, React hooks, and Runtime Protocol.

### Existing mechanisms

| Existing mechanism                        | Current meaning                                   | Receiver evidence                                                      | Missing boundary                                                  |
| ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Entity.domain.operation(input)`          | Entity-qualified Operation owner namespace        | Can project a type receiver when declared                              | Namespace access and type reception are indistinguishable         |
| `Entity.ref(locator).operation(args)`     | Bound Ref facade                                  | Ref proxy injects the Ref into one matching input position             | Matching is heuristic unless metadata disambiguates               |
| `graphOps: { receiver: 'path' }`          | Reflected distinguished input path                | Explorer exposes only explicit receiver Operations as instance actions | Server invocation and wire still treat it as ordinary input       |
| one-cardinality Selection input           | One selected Entity participant                   | Explorer can bind an Entity Ref as a one-item Selection                | Selection receiver is not declared or transported distinctly      |
| many-cardinality Selection input          | Explicit bulk participant                         | Portable Selection already survives input serialization                | No receiver binding, bulk lifecycle, or partial-failure semantics |
| relation Operation facade                 | `book.collaborators.invite(...)`-style affordance | Source Ref is injected under the relation's receiver name              | Relation/association is absent from the initial receiver algebra  |
| React `useOperation(Operation)`           | Functional runner                                 | Call site supplies the receiver Ref inside input                       | No receiver-bound hook projection                                 |
| Runtime Protocol `{ operationId, input }` | Closed portable invocation                        | Carries every current bound invocation after desugaring                | Receiver position is not part of the request or required metadata |

Core's Ref binder already refuses to guess when two inputs reference the same Entity type. That is
important evidence: placement under an Entity namespace does not identify which participant is the
receiver. `graphOps.receiver` is the existing explicit escape from that ambiguity, but its name and
location make it look like Explorer metadata rather than Operation semantics.

### Representative Operation classification

| Operation or shape                                          | Candidate receiver                                              | Evidence and tension                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Enrollment.enroll(input)`                                  | Enrollment Entity definition                                    | Factory/type behavior creates a new Enrollment; no instance exists yet                                                   |
| `Enrollment.activate({ enrollment })`                       | Enrollment Ref                                                  | The existing participant is the natural instance receiver                                                                |
| `Enrollment.cancel({ enrollment, endedAt })`                | Enrollment Ref                                                  | Remaining fields are ordinary arguments                                                                                  |
| `Student.transfer({ student, previousCourse, nextCourse })` | Student Ref                                                     | One Student and two Course participants are unambiguous, but declaration does not mark the receiver                      |
| `TodoList.suggestNextItem({ list })`                        | TodoList Ref                                                    | Explicit `graphOps.receiver`; model-backed implementation is orthogonal                                                  |
| `TodoList.completeAll({ list })`                            | TodoList Ref                                                    | Explicit receiver; durable execution does not change receiver identity                                                   |
| `TodoList.export({ list, requestId })`                      | TodoList Ref                                                    | Explicit receiver remains stable across an Event wait                                                                    |
| `TodoItem.addItem({ list, title })`                         | likely TodoList Ref or its `items` relation                     | Operation namespace says TodoItem, but the existing aggregate receiving “add” is the list; ownership and receiver differ |
| `TodoItem.deleteFromNamedList({ listName })`                | unresolved: TodoItem type, TodoList type, or Module/Application | No Ref/Selection target exists; a name is resolved during durable execution                                              |
| `Invite.merge({ source, target })` test shape               | no receiver without declaration                                 | Two symmetric Refs correctly cause current binding to reject inference                                                   |
| `Book.deleteBooks({ books: Selection<Book> })` test shape   | Book Selection                                                  | Proves portable bulk input, not yet receiver lifecycle semantics                                                         |
| `BookCollaborators.invite(...)` relation shape              | Book–collaborators association rooted at Book Ref               | Shows relation-bound behavior cannot always be reduced to the target Entity type                                         |

### Findings

1. **Receiver and Operation owner are separate axes.** `TodoItem.addItem` may be owned/named with
   TodoItem while being received by a TodoList or its `items` relation. Entity-qualified identity
   remains useful without forcing receiver type to equal owner type.
2. **A receiver is a distinguished participant position.** Binding should partially apply that
   position; the closed invocation can retain the current input contract. Removing the receiver
   from input would create a second validation and serialization path.
3. **Entity-type reception is the zero-instance case, not no receiver.** The Operation's semantic
   owner can supply this receiver through its qualified identity only when metadata declares the
   type-receiver mode; namespace ownership alone is insufficient.
4. **Inference is an authoring convenience, not canonical meaning.** A unique matching Ref can
   preserve today's terse API, but ambiguous or cross-owner behavior needs an explicit receiver
   declaration.
5. **Relation receivers deserve first-class pressure testing.** They may be a bound path over a
   source Ref rather than a new wire value, but they are not merely a target Entity Ref.
6. **Lifecycle choices are orthogonal.** Model-backed, code-backed, immediate, durable, atomic, and
   Event-waiting Operations retain the same candidate receiver.
7. **Protocol compatibility may be nearly free.** Receiver-aware authoring, reflection, React, and
   remote metadata can lower to the existing `OperationInvokeRequest` if the receiver remains in
   validated input. This is now the preferred hypothesis to disprove.

### Counterexamples that remain open

1. symmetric participants such as merge, compare, or transfer between two values of the same type;
2. behavior resolved from a human name or external key rather than an existing Ref;
3. relation/association behavior whose semantic subject is neither endpoint alone;
4. genuinely Module/Application-wide behavior;
5. a many-Selection receiver where authorization or effects succeed for only part of the set.

## Protocol And Authority Checkpoint — 2026-11-07

The second inventory slice followed an invocation through request parsing, Operation resolution,
schema validation, permission checking, Ref materialization, ordinary and durable execution,
Runtime Protocol dispatch, task identity, and trusted Invocation Context. No current guarantee
requires a second receiver value beside the Operation input. The preferred protocol contract is:

```text
open invocation
  Operation identity + receiver binding + remaining arguments
    -> bind the declared receiver position
    -> closed invocation { operationId, input }
    -> resolve Operation metadata
    -> validate the complete input once
    -> derive the effective receiver from metadata + validated input
```

The receiver declaration belongs to the portable Operation definition, not to caller-authored
request metadata. A conceptual reflected descriptor must distinguish at least:

1. an Entity-type receiver supplied by the Operation definition;
2. an input receiver at a declared Ref or Selection path, including Entity type and cardinality;
3. a relation receiver described by its source path and relation identity;
4. a Module/Application receiver if later evidence justifies that algebra member.

This is conceptual metadata, not yet a proposed TypeScript shape. It may refine or replace the
current `graphOps.receiver`, whose semantics are already close to an input receiver path but whose
placement suggests UI-only metadata.

### Why the wire should not duplicate the receiver

The current dispatcher resolves the Operation by `operationId`, validates its whole input schema,
and passes the resulting value to both permission checks and execution. Server execution then
materializes declared existing Refs, evaluates requirements, and starts durable work from that
same input. A parallel request field would create two candidate truths and require rules for
receiver/input mismatch, duplicate validation, signing, caching, idempotency, and migration.

The authoritative receiver is therefore derived only after Operation resolution and input
validation. Bound JavaScript methods, React hooks, CLI `use` state, generated clients, and model
proposals are projections that construct the same closed request; none can grant receiver status
by adding untrusted metadata.

Entity-type reception is the exception only in representation, not semantics: its value is the
declared Entity definition already named by portable Operation metadata, so no instance value is
added to input. Relation reception similarly needs portable relation metadata, while the concrete
source Ref remains at its validated input path.

### Trust and authority boundary

Receiver identity is caller-selectable domain input and therefore untrusted until validation and
authorization. Declaring one input path as receiver:

1. does not authenticate the Principal;
2. does not prove ownership, tenancy, membership, or Relation reachability;
3. does not select a privileged runtime, Resource binding, cache scope, or account;
4. does not bypass existing Ref materialization or Operation requirements;
5. does not make a client-supplied scope trustworthy.

The host continues to own Principal, Resource bindings, execution placement, evidence disclosure,
and other Invocation Context capabilities. Authorization may use the derived receiver as a typed
policy subject, but must evaluate it with the authenticated Principal and authoritative graph
facts. Permission checks and execution must derive the same receiver from the same validated input
and Operation version.

This boundary is also why receiver-derived Resource scope cannot mean copying a Ref locator into
`resourceBindingScope`. A future scope projection must be declared by the application, evaluated
after validation under authority, and produce only a lookup key; it never grants access by itself.

### Durable execution, identity, and evidence

Durable Operations currently derive `subject`, trigger, requirements, and task input from the
complete Operation input. Receiver-aware Operations should keep that property:

1. persist the closed, validated input and Operation identity as the semantic start request;
2. derive durable subject or future idempotency keys from declared functions over that input;
3. never persist a second authoritative receiver value that can drift from task input;
4. optionally project a safe receiver summary into Activity, audit, or indexes as derived evidence;
5. re-derive and re-authorize the receiver at lifecycle boundaries where authority must be
   rechecked rather than trusting old display evidence.

Plan 132 still owns request, delivery, idempotency, run, and attempt identity. Receiver identity may
participate in an idempotency key because it is already part of validated input; it is not another
invocation identity category. Immediate retry, implementation variants, Event waits, and resumed
Interactions likewise do not change the semantic receiver.

### Remote runtimes and routing

A remote or alternate-language runtime does not need the originating TypeScript facade. It needs
the same versioned semantic program metadata that defines the Operation input and receiver
descriptor. The invocation remains `{ operationId, input }`; after resolving the compatible
Operation definition, the receiving runtime derives the same receiver.

Routing remains a trusted evaluation decision:

```text
operationId
  -> resolve semantic Operation and required guarantees
  -> use trusted placement policy and, where declared, receiver-derived partition identity
  -> dispatch the unchanged closed invocation
  -> receiving authority validates and authorizes again
```

The receiver may influence locality or partition routing, but raw caller input must not choose an
execution authority. Plan 142h owns placement and partition policy; Plan 146i owns version and
capability negotiation. A runtime that lacks the compatible receiver descriptor or cannot preserve
its guarantees must fail closed rather than reinterpret the input heuristically.

### Compatibility decision

Plan 166 therefore retains Runtime Protocol's existing request shape for the implementation
proposal unless a later Selection or Module pressure test disproves it. Compatibility work is
metadata evolution:

1. legacy Operations have no canonical receiver until explicitly declared or safely migrated;
2. a unique Ref match may remain authoring sugar but never becomes remote semantic inference;
3. receiver-aware clients may bind ergonomically while older clients keep sending explicit input;
4. reflection must version the receiver descriptor before generated or remote consumers rely on
   it;
5. closed requests remain interoperable because the receiver value was never removed from input.

This preserves the functional Operation protocol while allowing object-like affordances at every
frontend.

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

- [x] Current Operation shapes are classified against the candidate receiver algebra, including genuine counterexamples.
- [x] Receiver, Principal, input participant, ambient context, implementation, Resource, and scope have non-overlapping meanings.
- [x] One canonical functional semantics explains entity-type, instance, Selection, and bound method projections.
- [x] Runtime Protocol representation, trust boundary, compatibility, and multi-runtime routing are specified.
- [ ] Server, generated-client, React, CLI, reflection, Devtools, durable, and model-backed impacts are mapped.
- [ ] Selection receiver semantics are honest about cardinality, authority, effects, retries, and partial failure.
- [ ] Receiver-derived scope composes with Resource binding without granting authority or hiding relation traversal.
- [ ] A bounded implementation plan is extracted only after the architectural decisions are recorded.
