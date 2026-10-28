# 160. Semantic Modules, Composition, And System Boundaries

Status: research

Canonical ID: `ontahi://plans/160-semantic-modules-composition-and-system-boundaries`

Shapes: [Semantic Module](../../atlas/items/model/semantic-module.md),
[Application](../../atlas/items/model/application.md),
[Entity](../../atlas/items/model/entity.md),
[Domain Operation](../../atlas/items/model/domain-operation.md),
[Event](../../atlas/items/model/event.md),
[Semantic Program Kernel](../../atlas/items/model/semantic-program-kernel.md), and
[Semantic Subjects And Runtime Concerns](../../atlas/items/model/semantic-subjects-and-runtime-concerns.md).

Related plans:

1. [71c. Ontahi Application Module Composition](../done/71c-ontahi-application-module-composition.md)
2. [142h. Distributed Execution Topologies](../backlog/142h-distributed-execution-topologies.md)
3. [146l. Event Brokers, Egress, And Durable Processing](../backlog/146l-event-brokers-egress-and-processing.md)
4. [146m. Managed HTTP Event Egress](../next/146m-managed-http-event-egress.md)
5. [154. Semantic Program Kernel And Distributed Evaluation](154-semantic-program-kernel-and-distributed-evaluation.md)
6. [158. Semantic Execution Context, Governance, And Evidence](158-semantic-execution-context-governance-and-evidence.md)
7. [159. Next.js Application Runtime Mount](../current/159-nextjs-application-runtime-mount.md)

## Summary

Investigate a first-class **Semantic Module** as the unit by which independently understandable
parts of an Ontahí program contribute Entities, Relations, Operations, Events, Interactions, and
named extensions to one composed Application graph. A Module is not a folder, package, service,
runtime, or deployment unit. It declares semantic ownership and dependencies before execution
topology decides whether its links remain local or cross a runtime boundary.

This plan also separates three adjacent dimensions that are commonly collapsed:

1. **Module and composition:** which semantic subjects and partial perspectives each concern adds,
   and how shared identities correspond;
2. **System boundary:** which external stimuli become Operation invocations or Event occurrences,
   and which semantic facts or capabilities may leave the Application;
3. **Execution topology:** which runtime, authority, storage, language, or deployment interprets
   each part of the composed graph.

The durable thesis is:

> **An Ontahí Module is a composable semantic contribution to an Application graph. Modules may
> relate Entities, invoke Operations, and exchange Events directly or across runtimes without
> making any one integration style universal.**

The first proof should remain in-process. Distribution is valuable evidence only after composition
has meaning independently from deployment.

## Why This Plan Exists

Code folders and packages can separate files without expressing the relationships that make a
large application one system. An educational platform may contain a core Rostering model and further
concerns such as Attendance, Alerts, and Communications. Those concerns are not fully isolated:

1. Attendance refers to Rostering's Enrollment and Student identities;
2. Alerts reacts to Attendance facts;
3. Communications contributes messaging capabilities over existing participant identities;
4. an Alert may invoke Communications synchronously when it requires an explicit result, or publish
   an Event when it announces a fact to zero or more consumers;
5. the same composition may begin in one TypeScript monolith and later place one concern in another
   runtime or language.

Treating every link as an Event loses request/result, structural, and ownership semantics. Treating
every link as a direct import hides asynchronous fact propagation and makes later placement opaque.
The relationship is deliberately plural: direct composition and decoupled propagation are
different tools that can coexist in one graph.

Plan 71c used “module” for a two-phase Entity declaration and migration binder needed to establish
`ontahi()` as the composition root. That completed implementation remains valid, but it is narrower
than this plan. A Semantic Module contains a named set of contributions and composition rules; it
is not the old `entityModule(...)` compatibility protocol and does not reopen that migration.

## Four Dimensions That Must Remain Distinct

| Dimension                | Question                                                          | Examples                                                             |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `SemanticModule`         | What meaning does this concern contribute?                        | Rostering, Attendance, Communications                                |
| `ApplicationComposition` | How do contributions correspond and coexist?                      | shared Student identity, named extension, dependency rule            |
| `SystemBoundary`         | How does the Application participate in a larger system?          | HTTP command ingress, webhook Event ingress, external Event egress   |
| `ExecutionTopology`      | Where and with which guarantees is each contribution interpreted? | same process, Rust runtime, remote authority, broker-backed delivery |

`Subgraph` describes a resulting projection or partition of the composed graph; it does not by
itself express semantic ownership. `Runtime` describes an execution participant; it does not define
a domain concern. `Boundary` describes admitted exchange; it is not the Module being exposed.

An authored Module should therefore survive changes in bundling, transport, storage, and runtime
placement. Topology may use Module identity as one placement input, but must not make a Module
synonymous with a microservice.

## Module Contributions And Links

A Module may contribute or depend on several first-level semantic forms:

| Link or contribution               | Meaning                                                                            | Example                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Entity ownership                   | Introduces a stable domain identity and lifecycle                                  | Rostering owns `Enrollment`                             |
| Entity Relation                    | States durable domain structure across Module ownership                            | `AttendanceRecord.enrollment -> Enrollment`             |
| Named Entity extension             | Adds one concern's perspective or capabilities without silently mutating the owner | Communications makes Student addressable as a recipient |
| Operation invocation               | Requests contracted work and observes a result or failure                          | Alerts invokes `sendMessage`                            |
| Event publication/subscription     | Announces and reacts to a fact without requiring one consumer                      | Attendance emits `AttendanceRecorded`                   |
| Interaction or Resource dependency | Requires participant input or an environment capability                            | Communications requests approval or consumes a provider |

These links may share routing, context, observability, and policy machinery, but they retain their
different semantics. Ontahí must not force every integration to Events in the name of decoupling,
nor turn every Event into a disguised synchronous call.

## Provisional Authoring Form

The following illustrates desired meaning rather than accepting a TypeScript API:

```ts
const Rostering = semanticModule({
  name: 'Rostering',
  entities: [Student, Course, Enrollment],
});

const Attendance = semanticModule({
  name: 'Attendance',
  uses: {
    entities: { Enrollment: Rostering.entities.Enrollment },
  },
  entities: [AttendanceRecord],
  operations: [markAttendance],
  events: [AttendanceRecorded],
});

const Communications = semanticModule({
  name: 'Communications',
  extends: [
    entityExtension({
      entity: Rostering.entities.Student,
      as: 'MessageRecipient',
      operations: [sendMessage],
    }),
  ],
});

const Alerts = semanticModule({
  name: 'Alerts',
  uses: {
    events: { AttendanceRecorded: Attendance.events.AttendanceRecorded },
    operations: { sendMessage: Communications.operations.sendMessage },
  },
  entities: [Alert],
  events: [AlertRaised],
});

const LearningPlatform = ontahi({
  modules: [Rostering, Attendance, Alerts, Communications],
});
```

An extension must be attributed and inspectable. It must not reopen an Entity declaration for
uncoordinated mutation or obscure which Module owns identity, storage, fields, Relations,
Operations, or policy. Composition must define collision, ordering, optionality, version, and
absence semantics before extensions become a public API.

## Subject-Oriented Composition Connection

Subject-Oriented Programming provides useful prior art for large-scale composition: independently
authored subjects can carry partial object models, shared identity relates their views, and explicit
composition rules reconcile them. Ontahí should borrow the pressure rather than revive a
class-weaving implementation:

1. a concern may contribute a partial perspective over an existing identity;
2. correspondence and composition are explicit rather than inferred from imports or equal names;
3. general composition rules may need deliberate exceptions;
4. ownership and provenance of every contribution remain inspectable.

Relevant primary research:

1. IBM Research, [Subject-Oriented Programming: A Critique of Pure Objects](https://research.ibm.com/publications/subject-oriented-programming-a-critique-of-pure-objects)
2. IBM Research, [Specifying subject-oriented composition](https://research.ibm.com/publications/specifying-subject-oriented-composition)
3. IBM Research, [Using subject-oriented programming to overcome common problems in object-oriented software development/evolution](https://research.ibm.com/publications/using-subject-oriented-programming-to-overcome-common-problems-in-object-oriented-software-developmentevolution)

Ontahí differs in important ways: its composition spans Entities, Relations, Operations, Events,
Interactions, and runtime capabilities; it is intended to survive language and runtime boundaries;
and its semantic identities can be projected through Runtime Protocol rather than only woven into
one executable class model.

## System Boundary And Integration Surface

The existing HTTP ingress route tables are useful adapter configuration, but `route` is HTTP
vocabulary rather than the canonical semantic center. A future `SystemBoundary` or
`IntegrationBoundary` should describe how an Application participates in a larger system while
preserving distinct typed bindings:

| Direction | Semantic binding                                   | Example projection                      |
| --------- | -------------------------------------------------- | --------------------------------------- |
| inbound   | external stimulus -> Operation invocation          | `POST /courses` invokes `Course.create` |
| inbound   | external stimulus -> one or more Event occurrences | provider webhook emits normalized facts |
| outbound  | Event occurrence -> external delivery              | signed HTTP webhook or broker message   |
| outbound  | Operation invocation -> remote capability          | RPC bridge to an external system        |

A cohesive authoring surface may list these bindings together because they form one Application
interface. Their internal contracts must remain separate. One inbound delivery may intentionally
produce several Events; several routes or channels may target one Event; and admission, mapping,
fan-out, authority, retry, and result semantics must be explicit rather than hidden in a global
provider callback.

Provisional canonical shape:

```ts
const LearningPlatformPublicBoundary = systemBoundary({
  name: 'learning-platform-public',
  bindings: [
    inboundCommand({ stimulus: httpPost('/courses'), invoke: Course.create }),
    inboundEvents({
      stimulus: httpPost('/providers/attendance'),
      map: externalAttendanceToEvents,
    }),
    outboundEvents({ source: AlertRaised, destination: ref('customer-webhooks') }),
  ],
});
```

The core declaration must not contain Next.js, Express, Kafka, gRPC, or provider credential types.
Technology packages project the boundary through a coherent adapter family. For example,
`@ontahi/runtime-nextjs` may supply ingress, Runtime Protocol, streaming, execution-context, and
observability adapters with shared host configuration rather than exposing one unrelated helper per
concern or becoming one inseparable adapter internally.

## Cross-System Execution Context

Module and boundary crossings should preserve causal identity even when the peer is not built with
Ontahí. The canonical context must distinguish rather than alias:

1. Session and client/surface provenance;
2. Interaction identity;
3. semantic root execution, parent execution, correlation, and causation;
4. Operation, Event occurrence, delivery, Task, and Resource-attempt identities;
5. local Unit Of Work and transaction scope;
6. telemetry trace and span context.

W3C Trace Context is the interoperability baseline for technical trace propagation, not the
durable business identity of a semantic execution. An adapter may translate `traceparent` and
`tracestate`; Ontahí still needs runtime-owned causal identities and must admit inbound context
through trust and disclosure policy.

Calling a multi-system chain a “transaction” must not imply atomic distributed commit. The initial
guarantee is traceable correlation and causation. A later Process, Saga, or workflow may coordinate
compensation and continuation. Generic distributed atomicity is not a goal.

## Infrastructure And Adapter Affordance

Module identity can later become an input to topology and infrastructure without embedding those
decisions in domain declarations:

```ts
place(Communications, {
  runtime: ref('communications-node-runtime'),
  requires: ['outbound-http', 'secrets', 'durable-events'],
});
```

The layering remains:

```text
Semantic Module         meaning and ownership
  -> Composition        correspondence, dependencies, extensions
  -> System Boundary    admitted exchange with a larger system
  -> Execution Topology placement, routing, authority, guarantees
  -> Adapter Binding    Next.js, Express, Rust, Postgres, Kafka, Kubernetes
```

A technology package should optimize the final author's affordance across the concerns it can
project. Internally separate adapters may share host lifecycle, configuration, secrets, context,
and observability. The semantic kernel absorbs stable concerns; adapters occupy only the holes that
genuinely vary by technology.

## First Concrete Proof

Use the educational-platform decomposition as an in-process semantic composition before attempting
federation:

1. Rostering owns Student, Course, and Enrollment;
2. Attendance owns AttendanceRecord, relates it to Enrollment, exposes `markAttendance`, and emits
   `AttendanceRecorded`;
3. Alerts subscribes to that Event and owns Alert;
4. Communications contributes one named messaging capability over a Rostering participant;
5. Alerts invokes Communications directly where request/result semantics are required;
6. reflection explains Module ownership and every cross-Module dependency;
7. removing or omitting a Module produces deterministic validation rather than an undefined import
   or runtime failure.

Only after this works in one runtime should a second proof place Communications elsewhere. The
semantic composition should remain unchanged while Runtime Protocol or another adapter turns its
Operation link into remote invocation. A later Event proof may place Alerts elsewhere and preserve
Event identity through asynchronous delivery.

## Research And Execution Slices

1. **Inventory current composition**
   - distinguish Application root, Entity declarations, `uses`, registration, packages, and runtime
     bindings;
   - record where current code imports hide semantic Module dependencies.
2. **Specify Module identity and ownership**
   - define name, version horizon, contributions, dependencies, reflection, and collision rules;
   - decide whether Module identity is nominal and how an Application addresses its exports.
3. **Prove cross-Module Relations and Operation use in-process**
   - compose the Rostering and Attendance identities;
   - compose one direct Operation dependency without a transport abstraction.
4. **Prove Event integration without universalizing it**
   - add Alerts as an Event subscriber;
   - explain why the Event link differs from the direct Operation and Relation links.
5. **Test one named Entity extension**
   - add Communications' participant capability with explicit provenance;
   - reject hidden mutation, ambiguous ownership, and collision.
6. **Reflect and validate the composed graph**
   - expose Module ownership and dependencies to analysis, codegen, Explorer, and diagnostics;
   - fail before execution when a required contribution is absent or incompatible.
7. **Specify System Boundary bindings**
   - recast existing Operation and Event ingress routes as technology projections;
   - prove one-to-many inbound Event mapping without merging it with Operation invocation.
8. **Test topology independence**
   - place Communications in a second identified runtime;
   - preserve semantic identity while changing only routing and capability binding.
9. **Extract implementation plans**
   - keep Module authoring, boundary authoring, cross-runtime placement, and infrastructure adapters
     independently shippable.

## Scope

1. Define Semantic Module identity, contribution, dependency, ownership, extension, and reflection
   semantics.
2. Define Application composition independently from code package and runtime topology.
3. Preserve Relations, direct Operation invocation, and Event delivery as different integration
   links.
4. Describe System Boundary as a typed integration surface above transport-specific route tables.
5. Reuse semantic execution context across Module, boundary, and runtime crossings.
6. Use one concrete domain decomposition and one later topology change as acceptance evidence.

## Non-Goals

1. Do not equate Module with microservice, package, folder, deployment, or graph partition.
2. Do not require Event-mediated communication between all Modules.
3. Do not permit arbitrary mutation of another Module's Entity declaration under the name of
   extension.
4. Do not infer generic distributed transactions or cross-runtime atomicity.
5. Do not design a universal infrastructure DSL before Module composition is proven in-process.
6. Do not make technology routes, credentials, provider payloads, or broker topics part of the
   semantic Module.
7. Do not replace current Application or Entity APIs until one vertical proves the smaller public
   abstraction.
8. Do not rename the completed Plan 71c migration protocol into this broader concept.

## Open Questions

1. Is `Module` sufficiently unambiguous as public language, or should the internal nominal concept
   remain `SemanticModule` while authoring uses `module(...)`?
2. What constitutes an exported versus private Entity, Operation, Event, Relation, or Value inside
   a Module?
3. Can another Module relate to an Entity without extending it, and which owner controls the
   Relation declaration and mutation policy?
4. Are extensions additive namespaces, explicit views, capabilities, partial Entity declarations,
   or a smaller combination of these?
5. How are optional Modules, version compatibility, replacement implementations, and feature
   selection represented without turning composition into a package manager?
6. Which cycles are legitimate semantic collaboration and which indicate hidden initialization or
   authority coupling?
7. Does a System Boundary belong to the Application, one Module, or a separately composed surface
   that can expose contributions from several Modules?
8. Which execution-context fields cross an untrusted external boundary, and which are regenerated,
   linked, redacted, or rejected?
9. When an Entity is enriched by several Modules, how do codegen and runtime projections avoid
   forcing every consumer to load every extension?
10. Which infrastructure requirements are semantic capabilities and which remain environment-only
    placement preferences?

## Acceptance Checklist

- [ ] One Application composes at least three named Modules with inspectable ownership.
- [ ] Cross-Module Relation, direct Operation invocation, and Event subscription all execute while
      retaining distinct lifecycle and failure semantics.
- [ ] One named extension contributes behavior over an existing Entity identity without silently
      transferring ownership or mutating the base declaration.
- [ ] Missing, conflicting, or incompatible contributions fail deterministically before affected
      execution.
- [ ] Reflection explains which Module owns and contributes every tested semantic form.
- [ ] The same composition first runs in one process and later places one Module in another runtime
      without rewriting its domain declarations.
- [ ] A System Boundary can project both Operation and Event ingress while keeping their contracts
      distinct.
- [ ] One external stimulus can intentionally normalize into several canonical Event occurrences.
- [ ] Cross-system execution preserves admitted causal and trace context without granting authority
      from caller-authored provenance.
- [ ] Technology adapters remain projections and do not become the semantic source of truth.
