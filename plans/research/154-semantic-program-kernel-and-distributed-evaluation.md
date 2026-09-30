# 154. Semantic Program Kernel And Distributed Evaluation

Status: research

Canonical ID: `ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation`

Related plans:

1. [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)
2. [144. Executable Ontologies](../backlog/144-executable-ontologies.md)
3. [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)
4. [146j. First-Class Events Runtime Protocol Gate](./146j-first-class-events-runtime-protocol-gate.md)
5. [128h. Observable Query Runtime And Durable Progress](../done/128h-observable-query-runtime-and-durable-progress.md)
6. [150. Ontahí DevTools Semantic Console](../current/150-ontahi-devtools-semantic-console.md)
7. [153. Model-Backed Todo Command Spike](../current/153-model-backed-todo-command-spike.md)
8. [153c. Operation Interactions And Resumption](../current/153c-operation-interactions-and-resumption.md)
9. [142h. Distributed Execution Topologies](../backlog/142h-distributed-execution-topologies.md)

## Summary

Investigate Ontahí as a language and distributed evaluation runtime whose semantic programs can be
partially constructed, completed by typed substitution, executed by capability-owning runtimes,
suspended for events or interactions, and observed as live values across process and transport
boundaries.

The existing system already contains much of this language in separate forms:

1. Selections and Queries are reflected expressions that can run once, stream one result, or remain
   observed as changing values.
2. Graph Commands and Operation Invocations are typed descriptions of effects.
3. Durable Operations and Task Runtime steps represent checkpointed evaluation and continuation.
4. Interactions suspend a run until a typed external response arrives.
5. Runtime Protocol transports canonical Reads, Commands, Invocations, observations, and durable
   control without making one framework or transport authoritative.
6. DevTools dialects and model interpretation are different frontends that produce existing
   canonical forms.

The new hypothesis is that these are projections of one smaller semantic kernel rather than an
accidental collection of protocols. A user interface, CLI, model, workflow, remote runtime, or
another program may construct or refine the same typed program. A runtime evaluates only the parts
for which it has declared capabilities and may delegate the remainder. React is one consumer of a
reactive Ontahí value; it does not own the reactivity.

The durable thesis is:

> **Ontahí programs describe values, computations, effects, waits, and observations over a shared
> semantic model. Runtimes complete and evaluate those programs wherever the required capabilities
> live.**

This plan is intentionally reformulatory and must proceed through small semantic proofs. It does
not authorize a syntax-first general-purpose language rewrite.

## Why This Plan Exists Now

The Model Support spike exposed partial application before Ontahí had named it. A natural-language
instruction such as “add item buy milk” may identify exactly one Operation while supplying only
part of its input:

```text
TodoItem.createItem(
  title = "buy milk",
  list = ?
)
```

The current implementation instead asks a model to produce several complete candidate invocations.
That works for a narrow choice, but it hides the more general structure:

1. the selected Operation is already known;
2. its input schema is the authoritative contract;
3. some arguments are bound and others remain unknown;
4. the missing value may be resolved by graph data, session context, a human interaction, a rule,
   another runtime, or a model;
5. only the completed application lowers to the existing canonical Operation Invocation.

The same structure appears outside models:

1. a generic create form knows the Operation and derives required fields from its schema;
2. a projectional editor autocompletes an incomplete Query or Command;
3. a CLI collects arguments incrementally;
4. a browser session may supply a selected Entity Ref to a program initiated from another session;
5. a distributed runtime may evaluate one subexpression and substitute its result before forwarding
   the program;
6. an Interaction or domain Event may resume a continuation by supplying the awaited value.

Observable Queries add the temporal dimension. `TodoItem.all` denotes a semantic value. One
evaluator may take a snapshot; another may keep that value current through native observation,
polling, invalidation, WebSocket delivery, or recomputation. The authored Query does not need to
encode the transport strategy.

## Research Thesis

Ontahí should test a semantic kernel in which:

1. Reads, Commands, and Operations are typed applications rather than unrelated request families at
   the language level.
2. An application may be open, with one or more typed variables awaiting substitution.
3. A closed application may still be unevaluated, suspended, durable, or reactive.
4. Values can be produced locally or by declared capabilities in other runtimes.
5. Observation belongs to the semantic evaluation model and survives transport boundaries.
6. Events bind values into suspended continuations without becoming Query snapshots.
7. Existing canonical requests remain stable wire projections for closed executable programs.
8. Authority, policy, consistency, lifecycle, and delivery guarantees remain explicit at every
   evaluation boundary.

The kernel should be smaller than the current API surface. Its usefulness must be demonstrated by
projecting existing Ontahí concepts into it, not by renaming all existing concepts prematurely.

## Provisional Semantic Vocabulary

These names express candidate semantics, not accepted TypeScript APIs.

| Concept             | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `Program<T>`        | A typed semantic term that may produce `T`                                      |
| `Value<T>`          | A value already available to evaluation                                         |
| `Hole<T>`           | A typed variable with no bound value yet                                        |
| `Computation<T>`    | A closed term that declares how to produce `T`                                  |
| `Effect<T>`         | A computation requiring an external or state-changing capability                |
| `Event<T>`          | A discrete occurrence carrying `T`, without an implied current value            |
| `Reactive<T>`       | A current `T` plus later revisions while observation remains active             |
| `Application<I, O>` | A function-like semantic term applied to typed input                            |
| `Environment`       | Bindings, contextual values, capabilities, and authority visible to evaluation  |
| `Substitution`      | A binding from one or more named holes to validated values or terms             |
| `Continuation<T>`   | The resumable remainder of a suspended program                                  |
| `Evaluator`         | A runtime capable of reducing some program terms                                |
| `Handler`           | An implementation of an effect, wait, interaction, event source, or observation |

### States that must remain distinct

| State                | Meaning                                                          | Example                         |
| -------------------- | ---------------------------------------------------------------- | ------------------------------- |
| Open                 | A required value or term has no producer                         | `list = ?list`                  |
| Closed but pending   | Every term has a producer, but evaluation has not completed      | `IMDb.rating(movie.imdbId)`     |
| Suspended            | Evaluation checkpointed a continuation awaiting a matching event | approval decision               |
| Current and reactive | A value exists and remains connected to changing dependencies    | observed `TodoItem.all`         |
| Completed            | Evaluation produced a terminal value or outcome                  | invoked Operation result        |
| Unresolved           | No permitted resolver can close an open term                     | inaccessible or ambiguous input |
| Failed               | A selected evaluator or effect failed                            | external provider unavailable   |

A hole is not a slow computation. A suspended program is not an open program. A reactive value is
not merely an event stream. These distinctions are foundational even when one Task Runtime or Effect
Stream supplies common implementation machinery.

## Programs, Requests, And Wire Forms

`Request` should remain transport vocabulary rather than the root semantic concept. An open
Operation application may be authored concisely:

```text
TodoItem.createItem(
  title = "buy milk",
  list = ?list
)
```

Its normalized internal representation needs one argument tree in which every position is either a
term or an unbound variable. It must not duplicate separate `bindings`, `holes`, and `contract`
sections. The Operation's declared input schema remains the only contract.

One intentionally verbose candidate IR is:

```json
{
  "kind": "operation-application",
  "operationId": "TodoItem.createItem",
  "arguments": {
    "title": { "kind": "value", "value": "buy milk" },
    "list": { "kind": "hole", "id": "list" }
  }
}
```

The public authoring syntax does not need to expose those wrappers. Once all required arguments are
bound, the program lowers to the existing executable form:

```json
{
  "kind": "invoke",
  "operationId": "TodoItem.createItem",
  "input": {
    "title": "buy milk",
    "list": {
      "kind": "entity-ref",
      "entityName": "TodoList",
      "locator": { "id": "list-supermarket" }
    }
  }
}
```

The first form is a program. The second is an executable Runtime Protocol request. Treating an open
program as an executable invocation would bypass input validation and must remain impossible.

### Omission and explicit holes

For Operation inputs, the parser may infer holes for omitted required fields:

```text
TodoItem.createItem(title = "buy milk")
```

may normalize to:

```text
TodoItem.createItem(title = "buy milk", list = ?list)
```

Absence cannot universally mean a hole:

1. an omitted optional input may mean “use the declared default”;
2. an omitted Query predicate means no predicate, not an unknown predicate;
3. explicit `null`, defaulted, computed, and server-bound values have different meaning;
4. a caller may deliberately request resolution of an otherwise optional value.

The language therefore needs explicit holes even if common required-input omissions desugar into
them. Named holes also permit unification across several positions:

```text
TodoItem where list = ?selectedList

TodoList.rename(
  list = ?selectedList,
  name = "Today"
)
```

One substitution can close both terms.

## Resolution And Substitution

A hole declares missing meaning. It should not embed a provider instruction such as “ask an LLM”
or “render a dropdown.” Its type and constraints come from its position in the model. Runtime
resolution policy chooses among available resolvers.

For `list: TodoList.ref`, candidate resolution may proceed as follows:

1. use a compatible value already bound in the program environment;
2. use session or participant context, such as the currently selected Todo List;
3. execute an authorized candidate Selection declared for that Ref position;
4. bind automatically when exactly one candidate exists;
5. request a choice when a bounded candidate set has several values;
6. request free input or search when candidate enumeration is inappropriate;
7. delegate to another capable runtime;
8. let a model propose a value under the same constraints;
9. return unresolved when no permitted resolver can bind the hole.

`choice` is a resolution strategy and presentation, not the type of the hole. The same unresolved Ref
may appear as a chat question, form select, CLI prompt, voice interaction, or projectional-editor
completion.

Entity-level metadata may provide default identity, label, search, and compact presentation. The
specific Operation input or Query position must still be able to restrict candidate scope. “Any Todo
List” and “a Todo List writable by this principal” are not equivalent reference resolvers.

Substitution should be immutable and inspectable. Each accepted binding needs provenance, model
version compatibility, and causal identity when it crosses runtimes. Concurrency and merge rules are
deferred until a vertical proof requires them; the plan must not imply a general CRDT for programs.

## Reads, Commands, And Operations As Applications

The first experiment should use Operations because their object input schema makes required
arguments explicit. The kernel must later explain all three existing canonical forms.

```text
TodoItem.createItem(title = "buy milk", list = ?list)
```

```text
TodoItem
  where owner = ?owner
  and completed = false
```

```text
update TodoList
  target = ?list
  with { name = "Today" }
```

An Operation application derives its argument positions from the Operation input schema. A Query
derives variables from authored expression positions, parameters, factories, and contextual
bindings. A Command derives variables from target, predicate, expected-current state, and mutation
values. They may share substitution and evaluation mechanics without erasing their different
effect, authority, cardinality, and consistency contracts.

The plan must test whether a common `Application` abstraction genuinely reduces concepts. It must
not add a wrapper that merely nests the existing Read, Command, and Invoke ASTs without enabling
shared inference, substitution, tooling, or execution.

## Temporal Semantics And Reactive Values

Observation belongs to Ontahí's evaluation model. React, a CLI, a workflow, another Operation, and a
remote runtime are consumers of the same reactive value.

One semantic Query may support multiple evaluation modes:

```text
run(TodoItem.all)      -> TodoItem[]
observe(TodoItem.all)  -> Reactive<TodoItem[]>
```

The existing Query observation contract is strong evidence:

1. the first revision is the complete current result;
2. later revisions are complete current results when meaning changes;
3. observation identity differs from Query identity and transport session identity;
4. a runtime may use native notification, CDC, invalidation, WebSocket, polling, or recomputation;
5. unsupported observation remains explicit;
6. cancellation releases the observation and underlying resources.

This differs from row streaming during one execution and from Operation progress:

```text
OperationProgress<T> = progress updates followed by one terminal Result<T>
Reactive<T>          = current T followed by revisions until cancellation or completion
Event<T>             = discrete occurrences of T without an implied current value
```

The first kernel must preserve these distinct temporal meanings even if Effect `Stream` remains the
common Core execution primitive.

## Events, Waits, And Continuations

Approval is a program suspended on a correlated event:

```text
decision = await ApprovalRequested(proposal)

if decision == approve:
  execute(proposal)
else:
  reject()
```

The runtime persists a continuation and the exact expected interaction. A valid response binds
`decision` and resumes evaluation. It does not keep a JavaScript stack or worker blocked.

A domain reaction has the same control primitive but different event semantics and lifetime:

```text
on each Book.created as book:
  users = User where bookNotifications = true
  sendEmail(users, book)
```

Candidate temporal operators are:

```text
await(eventPattern)          -> Task<T>
onEach(eventStream, program) -> DurableTask<void>
observe(program)             -> Reactive<T>
emit(event)                  -> Effect<void>
```

Choice response, approval response, timer, webhook, queue delivery, and domain Event may all resume
a continuation, but their declaration, producer authority, matching, retention, ordering, replay,
acknowledgement, and delivery guarantees differ. Plan 146j remains the gate for a first-class Event
protocol. This plan supplies the larger language context; it does not bypass that gate.

A durable runtime should persist logical evaluation state such as:

```text
program identity
program revision or model version
current step
environment and substitutions
expected event or interaction
continuation state
trigger and principal identity
causal and idempotency identity
```

The exact representation remains runtime-private until two engines demonstrate a stable shared
contract.

## Distributed Evaluation Model

The distributed-VM hypothesis is stronger than remote procedure calls. A node may receive an open
program, close some variables, evaluate a supported subterm, or maintain a reactive dependency,
then return a substitution or forward the remaining program.

```text
frontend
  -> typed open program
  -> resolution and substitution
  -> closed semantic program
  -> distributed execution plan
  -> capability-owning evaluators
  -> value / reactive value / effect result
```

One example crosses CLI, server, and browser boundaries:

1. the CLI produces `TodoItem.createItem(title = "buy milk", list = ?list)`;
2. the server resolves an authorized Todo List candidate Query;
3. several candidates require a participant interaction;
4. the user's browser session can present the choice and has relevant visual context;
5. the response substitutes a canonical `TodoList` Ref into the durable program;
6. the server owning `TodoItem.createItem` validates and executes the closed invocation;
7. every observer of the affected Todo Query receives the resulting current value.

A federated reactive Query exercises computation placement:

```text
Movie
  where owner = CurrentPrincipal()
  and IMDb.rating(imdbId) > 3
```

`CurrentPrincipal()` is a contextual computation. `IMDb.rating(...)` is an external read capability,
not a hole. A planner may read local movies, batch remote rating lookups, join the values, apply the
predicate, and maintain the result if compatible observers exist. Transport, batching, push, and
polling remain execution-plan concerns rather than authored Query syntax.

The Runtime Protocol remains the wire ABI for established closed capabilities. An open-program or
distributed-plan protocol should be added only after local semantic proofs establish what must cross
the boundary. Do not send arbitrary executable JavaScript or user-controlled authority in a program.

## Security And Correctness Invariants

1. Only a closed program whose required inputs validate against the current model may execute an
   effect.
2. Operation, Entity, Field, Relation, Query, and Command declarations remain the source of type and
   contract truth; an open program does not duplicate or weaken them.
3. A substitution cannot grant authority. Every resolver and evaluator rechecks authority at its
   own boundary using receiver-owned identity.
4. A runtime may expose only resolvers, handlers, and evaluators allowed by application policy.
5. Model output is a proposed term or substitution, never an authority decision.
6. A resumed continuation restores the initiating execution identity and separately authorizes the
   participant or event producer.
7. Open-program transport preserves model/version compatibility and rejects unknown or stale terms
   rather than guessing.
8. Effect classification, idempotency, retry, and consistency requirements remain visible to the
   execution planner.
9. Observation never implies exhaustive event history or exactly-once delivery.
10. Event delivery never implies exactly-once external effects.
11. Distributed evaluation does not imply distributed transactions.
12. Every substitution, delegation, wait, resume, and effect dispatch is inspectable without
    leaking private values or credentials.

## Relationship To Existing Plans

This plan coordinates existing evidence rather than superseding it immediately:

1. Plan 142 owns declarative contracts, derived values, requirements, and execution planning
   evidence.
2. Plan 144 owns ontology authoring and the thesis that the canonical ontology is executable.
3. Plan 128h established transport-neutral Query observation and remains the current semantic
   contract for reactive graph values.
4. Plan 146 owns Runtime Protocol envelopes and established capability families.
5. Plan 146j owns first-class Event declaration and delivery semantics.
6. Plan 150 owns semantic authoring and inspection in DevTools.
7. Plan 153 owns natural-language interpretation into existing semantic capabilities.
8. Plan 153c owns typed interactions and resumable Operation evidence.
9. Plan 142h owns concrete deployment topology, consistency, and convergence work.

If the kernel is validated, those concepts may become projections of one language model. Until then,
their current public contracts remain authoritative.

## Scope

1. Inventory existing ASTs, schemas, reflection, canonical requests, evaluators, observers, Task
   state, Interactions, and Runtime Protocol lowering.
2. Define the smallest typed term and application vocabulary that embeds existing Operation input
   without duplicating its schema.
3. Specify omission, defaults, explicit holes, named holes, nested input, arrays, Refs, and variable
   unification.
4. Define immutable substitution, validation, provenance, and explainability.
5. Build one local Operation partial-application proof without a model dependency.
6. Project the same open application through a generic UI and one conversational surface.
7. Test the abstraction against Graph Read and Graph Command without changing their current wire
   protocols.
8. Reinterpret one existing Query observation as evaluation of a reactive program.
9. Relate typed wait/resume to the same kernel while preserving Interaction and Event distinctions.
10. Demonstrate bounded evaluation delegation between two runtimes only after the local kernel is
    stable.
11. Define compatibility and migration rules for current TypeScript and declarative dialects.
12. Extract implementation subplans rather than shipping the full hypothesis in one intervention.

## Non-Goals

1. Do not design or ship a general-purpose programming language.
2. Do not replace TypeScript as an implementation language for code-backed Operations.
3. Do not rewrite existing Query, Command, Operation, Task, or Runtime Protocol APIs before a
   vertical proof shows a smaller stable kernel.
4. Do not make every absent optional field a hole.
5. Do not attach one resolution provider or presentation such as LLM, dropdown, or chat to a hole.
6. Do not serialize JavaScript closures or stacks as continuations.
7. Do not make arbitrary remote code executable.
8. Do not claim automatic distribution, optimal query planning, generic distributed transactions,
   exactly-once delivery, or convergence.
9. Do not collapse Events, Query observations, row streams, and Operation progress into one stream
   contract.
10. Do not make React, WebSocket, LangGraph, Vercel Workflows, queues, or one storage provider the
    semantic owner of reactivity or suspension.
11. Do not let fuzzy interpretation bypass canonical validation, scope, authority, or effect policy.
12. Do not create a public package until the first two semantic proofs establish a reusable boundary.

## Execution Slices

### Slice 0: Semantic Inventory And Compatibility Baseline

- [ ] Map every current semantic AST and evaluator to candidate kernel terms.
- [ ] Record current TypeScript inference, reflection, serialization, and runtime guarantees that
      cannot regress.
- [ ] Define conformance examples for closed Read, Command, and Operation applications.
- [ ] Identify apparent unifications that would only rename or wrap existing concepts.

### Slice 1: Operation Application And Typed Holes

- [ ] Define an internal open Operation application representation.
- [ ] Infer argument types from the existing Operation input schema.
- [ ] Normalize omitted required inputs into holes while preserving optional/default semantics.
- [ ] Support explicit and named holes without exposing duplicate contract metadata.
- [ ] Validate substitution and lower only a closed application into `OperationInvokeRequest`.
- [ ] Prove the complete lifecycle with `TodoItem.createItem(title = "buy milk", list = ?list)`.

### Slice 2: Resolution And Generic Projection

- [ ] Define a resolver contract that consumes a typed hole plus authorized environment.
- [ ] Separate candidate discovery, auto-binding, choice, free input, and unresolved outcomes.
- [ ] Declare reusable Entity Ref presentation and input-position candidate restrictions.
- [ ] Render the same open application as a generic form, CLI-style prompt, and conversational
      Interaction without changing its semantics.
- [ ] Record provenance for every accepted substitution.

### Slice 3: Read And Command Generalization

- [ ] Represent one parameterized Graph Read with a named hole.
- [ ] Represent one Graph Command target or value hole.
- [ ] Reuse substitution and validation without weakening cardinality, mutation, or authority rules.
- [ ] Lower closed terms to the current Graph Read and Graph Command requests unchanged.
- [ ] Decide whether one common Application abstraction is real or should remain a family of typed
      terms sharing smaller substitution primitives.

### Slice 4: Reactive Program Evaluation

- [ ] Express run-once and observe evaluation over one canonical Query term.
- [ ] Preserve complete-current-result Query observation semantics.
- [ ] Define dependency and lifecycle metadata without naming polling or WebSocket in the program.
- [ ] Prove one React consumer and one non-React consumer observe the same semantic value.
- [ ] Test a bounded derived or external read dependency before attempting general federation.

### Slice 5: Wait, Event, And Continuation Semantics

- [ ] Project approval and choice Interactions as typed waits over persisted continuations.
- [ ] Distinguish one-shot `await`, persistent `onEach`, and reactive `observe` lifecycles.
- [ ] Relate domain Events to the kernel without preempting Plan 146j's declaration and delivery
      decisions.
- [ ] Prove restart-safe wait and resume on two Task Runtime implementations.
- [ ] Specify correlation, actor authorization, cancellation, timeout, and idempotency boundaries.

### Slice 6: Bounded Distributed Evaluation

- [ ] Define evaluator capability discovery and explicit unsupported-term behavior.
- [ ] Delegate one closed read-only subcomputation between two runtimes.
- [ ] Delegate one typed hole resolution and return an inspectable substitution.
- [ ] Preserve authority, cancellation, provenance, model compatibility, and causal identity.
- [ ] Keep execution placement separate from authored semantic meaning.

### Slice 7: Frontends, Models, And Tooling

- [ ] Treat TypeScript, declarative text, projectional editing, UI forms, CLI, and natural language as
      frontends producing the same semantic terms.
- [ ] Project model tools from closed or completable Ontahí applications rather than creating a
      parallel tool vocabulary.
- [ ] Let a model propose terms and substitutions under the ordinary resolver and authority rules.
- [ ] Inspect open terms, substitutions, evaluation plans, waits, and reactive dependencies in
      DevTools.
- [ ] Generate readable dialect text from the semantic AST for review and diagnostics.

### Slice 8: Decision And Public Boundary

- [ ] Compare the experimental kernel with existing public concepts and remove duplicate terms.
- [ ] Decide whether the kernel belongs in Core, a language package, or an internal compilation
      boundary.
- [ ] Decide which parts become durable Atlas Items.
- [ ] Define source and wire compatibility for existing applications.
- [ ] Extract implementation plans and close or reshape precursor plans only with recorded evidence.

## First Vertical Proof

The first implementation subplan should deliberately avoid LLMs, remote execution, and new Event
delivery:

```text
TodoItem.createItem(title = "buy milk")
```

1. Reflection resolves the existing Operation and input schema.
2. Normalization produces one typed `list` hole.
3. An authorized resolver executes the declared Todo List candidate Selection.
4. One candidate binds automatically; several candidates produce a generic choice Interaction.
5. A browser form and a chat renderer project the same pending application.
6. The accepted response substitutes a canonical Todo List Ref.
7. The now-closed application lowers to the existing `OperationInvokeRequest`.
8. The existing dispatcher validates, authorizes, and executes it.
9. DevTools shows the open application, resolver decision, substitution, closed invocation, and
   resulting graph activity as one causal execution.

This proof tests whether partial application is a real framework primitive rather than more
model-command orchestration. It must remain useful when the interpreter is entirely code-backed.

## Second Vertical Proof

After the first proof, reuse the kernel for a live Query with one externally computed value:

```text
Movie
  where owner = CurrentPrincipal()
  and IMDb.rating(imdbId) > 3
```

The proof may use a fake IMDb adapter. It must demonstrate:

1. contextual and external computations are closed producers rather than holes;
2. the planner batches or otherwise bounds external evaluation;
3. `run` produces one result snapshot;
4. `observe` maintains the same semantic value through at least one dependency revision;
5. React and a headless consumer receive equivalent values;
6. the authored program contains no polling, WebSocket, React, or adapter-specific syntax.

This proof is allowed to conclude that full reactive federation is premature. Its purpose is to
find the minimal dependency and evaluator contracts.

## Verification Strategy

1. Golden semantic examples that parse or author into one normalized kernel representation.
2. Type-level tests proving hole types derive from declared schemas and substitutions preserve
   output inference.
3. Runtime tests proving open terms cannot dispatch and closed terms reuse existing dispatchers.
4. Resolver tests for zero, one, several, inaccessible, stale, and invalid candidates.
5. Cross-surface tests proving form, CLI, chat, and DevTools projections bind the same program.
6. Query observation tests proving React-independent initial and revised values.
7. Task Runtime conformance tests for wait, checkpoint, resume, cancellation, and identity.
8. Runtime Protocol tests only after a local IR demonstrates which terms require transport.
9. Security tests proving substitutions and remote evaluation cannot widen authority.
10. Failure-injection tests for disconnect, stale model version, resolver loss, duplicate events,
    partial runtime capability, and external-effect retry.

## Acceptance Checklist

- [ ] The kernel vocabulary explains existing Reads, Commands, Operations, Interactions, and Query
      observation without erasing their guarantees.
- [ ] One Operation application is incrementally completed from its existing input schema.
- [ ] Bound arguments and holes occupy one argument structure with no duplicated contract.
- [ ] Omitted required, omitted optional, explicit hole, default, `null`, and contextual values have
      distinct semantics.
- [ ] Named-hole substitution works across more than one term position.
- [ ] An open application cannot reach an effect dispatcher.
- [ ] A closed Operation application lowers to the unchanged canonical invocation protocol.
- [ ] The same unresolved Ref projects to at least two interaction surfaces.
- [ ] A resolver is replaceable without changing the authored program.
- [ ] A model is optional and receives no special authority.
- [ ] One Graph Read and one Graph Command reuse the substitution model.
- [ ] One canonical Query can run once or produce a React-independent reactive value.
- [ ] Event occurrence, reactive revision, row stream, and Operation progress remain distinguishable.
- [ ] Approval is represented as a typed durable wait with participant authorization.
- [ ] One second Task Runtime resumes the same semantic wait.
- [ ] One bounded subcomputation or substitution crosses a runtime boundary.
- [ ] DevTools explains open terms, substitutions, waits, delegates, effects, and outcomes causally.
- [ ] Existing application APIs remain compatible until a smaller public boundary is proven.
- [ ] Follow-up implementation plans are extracted with explicit ownership and dependencies.

## Candidate Follow-Up Plans

These are anticipated slices, not created plans yet:

1. `154a`: semantic terms and Operation partial application;
2. `154b`: typed-hole resolution and generic interaction projection;
3. `154c`: open Graph Reads and Commands;
4. `154d`: reactive program evaluation and dependency planning;
5. `154e`: Event waits, reactions, and durable continuation semantics;
6. `154f`: distributed evaluation and substitution routing;
7. `154g`: semantic frontends, model projection, and DevTools inspection.

## Open Questions

1. Is `Program<T>` the correct root, or should Ontahí expose a smaller `Term<T>` with execution
   represented separately?
2. Which term forms are irreducible, and which are projections of existing Selection and model
   expression ASTs?
3. Should input-object field omission desugar during authoring, normalization, or resolution?
4. How are explicit holes represented without colliding with valid JSON values?
5. How are nested objects, arrays, unions, variants, defaults, and repeated named holes typed?
6. Does a hole carry only identity and inferred constraints, or also accepted resolver classes?
7. How does a resolver explain why it auto-bound, asked, searched, delegated, or failed?
8. Can Graph Reads and Commands share application mechanics without hiding cardinality or effect
   semantics?
9. Is reactivity an evaluation mode, a type constructor, an effect, or a combination of these?
10. How are reactive dependency graphs represented without coupling the language to one scheduler?
11. Which derived and external fields are safe to evaluate per row, and where is batching declared?
12. What consistency does a reactive value claim when dependencies belong to several runtimes?
13. Are `await`, `onEach`, and `observe` language operators or runtime lifecycle projections?
14. What is the smallest first-class Event model compatible with persisted continuations?
15. Which continuation state may be portable across Task Runtimes?
16. How are parent/child programs, nested Operations, and causal Activity represented?
17. What model/version fingerprint is sufficient when an open program crosses runtimes?
18. How are competing or concurrent substitutions serialized, rejected, or reconciled?
19. What capability discovery is safe to expose without leaking private topology?
20. Where should the evaluator refuse distribution because authority, consistency, cost, or
    lifecycle requirements cannot be preserved?

## Initial Decisions

1. Ontahí will investigate a language kernel before extending Model Support with more ad hoc
   conversational orchestration.
2. Existing schemas and model declarations remain the source of types and contracts.
3. Open programs and executable Runtime Protocol requests are distinct forms.
4. Holes represent missing producers; closed computations may still await evaluation.
5. Resolution strategy and presentation are external to hole identity.
6. Query observation is semantic and React-independent.
7. Events and reactive values remain distinct despite shared streaming machinery.
8. Durable waits persist continuations and expected signals rather than JavaScript stacks.
9. Runtime distribution follows declared evaluator capabilities and cannot widen authority.
10. Current Read, Command, Invoke, Observe, and Durable protocols remain the compatibility boundary
    until local proofs justify a smaller shared IR.
11. The first proof is local, deterministic, and model-optional.
12. Public API and package decisions are deferred until the first two vertical proofs produce
    evidence.
