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
9. [153d. LangGraph Task Runtime Comparison](../current/153d-langgraph-task-runtime-comparison.md)
10. [142h. Distributed Execution Topologies](../backlog/142h-distributed-execution-topologies.md)
11. [119. Selection Relation Predicates](../backlog/119-selection-relation-predicates.md)

## Summary

Investigate Ontahí as a language and distributed evaluation runtime whose semantic programs can be
partially constructed, completed by typed substitution, executed by capability-owning runtimes,
suspended for events or interactions, and observed as live values across process and transport
boundaries. Also investigate addressable, stateful semantic participants that receive messages,
configure the environment in which programs are interpreted and resolved, and may initiate many
independent program runs over time.

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
7. Model Support currently behaves like one implicit default participant: each message starts one
   bounded interpretation run, while provider, affordances, grounding, presentation, context, and
   instructions are supplied as unrelated runtime options.

The new hypothesis is that these are projections of one smaller semantic kernel rather than an
accidental collection of protocols. A user interface, CLI, model, workflow, remote runtime, or
another program may construct or refine the same typed program. A runtime evaluates only the parts
for which it has declared capabilities and may delegate the remainder. React is one consumer of a
reactive Ontahí value; it does not own the reactivity.

The durable thesis is:

> **Ontahí programs describe values, computations, effects, waits, and observations over a shared
> semantic model. Runtimes complete and evaluate those programs wherever the required capabilities
> live.**

An assistant or other semantic participant is not the program and does not own its contracts. It is
an addressable receiver that contributes an interpretation frontend, an evaluation environment, and
an execution strategy. A session relates participants over time; each requested or autonomous unit
of work still has its own inspectable Program Run.

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
9. Addressable assistants may receive multiple messages, retain carefully scoped state, use
   different providers, and initiate concurrent or autonomous Program Runs without becoming an
   authority source or a parallel semantic language.
10. Assistant state, interaction-session state, and Program Run state remain separate even when one
    durable runtime persists all three.

The kernel should be smaller than the current API surface. Its usefulness must be demonstrated by
projecting existing Ontahí concepts into it, not by renaming all existing concepts prematurely.

## Provisional Semantic Vocabulary

These names express candidate semantics, not accepted TypeScript APIs.

| Concept             | Meaning                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `Program<T>`        | A typed semantic term that may produce `T`                                       |
| `Value<T>`          | A value already available to evaluation                                          |
| `Hole<T>`           | A typed variable with no bound value yet                                         |
| `Computation<T>`    | A closed term that declares how to produce `T`                                   |
| `Effect<T>`         | A computation requiring an external or state-changing capability                 |
| `Event<T>`          | A discrete occurrence carrying `T`, without an implied current value             |
| `Reactive<T>`       | A current `T` plus later revisions while observation remains active              |
| `Application<I, O>` | A function-like semantic term applied to typed input                             |
| `Environment`       | Bindings, contextual values, capabilities, and authority visible to evaluation   |
| `Substitution`      | A binding from one or more named holes to validated values or terms              |
| `Continuation<T>`   | The resumable remainder of a suspended program                                   |
| `Evaluator`         | A runtime capable of reducing some program terms                                 |
| `Handler`           | An implementation of an effect, wait, interaction, event source, or observation  |
| `Assistant`         | An addressable semantic participant configured with frontends and an Environment |
| `Session`           | A scoped relationship among participants across one or more messages             |
| `ProgramRun`        | One causally identified evaluation of a Program                                  |
| `Provider`          | An inference service used by a model frontend, not an evaluator authority        |

`Assistant` is provisional terminology. Ontahí already uses Task `actor` for the authenticated
user, service, or system identity that caused work and may answer an Interaction. Reusing `Actor`
for a model-backed participant would blur identity and authorization. A future persisted Assistant
instance may be Entity-like and stateful, but this plan must not assume that every Assistant is an
ordinary data-graph Entity or that declaring one grants capabilities.

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

## Participants, Sessions, And Program Runs

The first Model Support implementation is request-shaped. One message asks a model to infer one
Read, Command, or Operation Invocation; an explicit Task may then pause for a choice or approval and
eventually completes. In function-like terms it is approximately:

```text
interpret(message, environment) -> proposed program or terminal answer
evaluate(proposal)               -> result, interaction, unresolved, or failure
```

This bounded lifecycle remains useful. It is one Program Run with a beginning, durable waits, and a
terminal outcome. It should not be confused with a long-lived participant. A live Assistant is an
addressable identity that may receive many messages and start many such runs:

```text
Session(todo-assistant, user)
  message 1 -> ProgramRun A -> completed
  message 2 -> ProgramRun B -> suspended on a choice
  timer     -> ProgramRun C -> completed
  message 3 -> ProgramRun D -> running concurrently with B
```

“Live” does not require one blocked process, permanent JavaScript object, or infinite workflow. It
means the Assistant can be addressed over time, has explicitly scoped durable state, and may respond
to messages or declared triggers by initiating work. Concurrent runs remain distinct causal units;
shared Session or Assistant state requires explicit consistency rules rather than mutable prompt
history hidden inside a provider.

### Three state domains

| State domain      | Lifetime and examples                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Assistant state   | Identity, durable preferences, long-term memory references, provider/profile selection  |
| Session state     | Participants, channel bindings, conversation history, selected UI context, active turns |
| Program Run state | Program revision, substitutions, current step, waits, continuation, effects, outcome    |

Assistant state may outlive every Session. A Session may contain several sequential or concurrent
Program Runs. A Program Run may move across evaluators or survive restart without turning its local
substitutions and continuation into global Assistant memory. Promotion of a Run result into Session
or Assistant state must be an explicit effect with provenance and authority.

The authenticated Task `actor` remains separate from all three. It identifies who caused work and
which participant may answer an Interaction. An Assistant never gains the caller's authority merely
because a message was addressed to it. Autonomous runs need their own declared trigger and service
or system Principal, and every dispatched effect is authorized again by the receiver.

### Assistant definition and environment

One provisional declaration shape is:

```text
Assistant
  identity and address
  model frontend and Provider selection
  visible semantic capabilities
  grounding and resolver policy
  context disclosure
  presentation and localization
  execution strategy
```

These concerns form a cohesive receiver configuration, but they are not embedded in Program terms.
`?list` remains a typed hole rather than “ask assistant X” or “use provider Y.” The selected
Assistant contributes an Environment containing permitted resolvers and contextual values. Another
Assistant, a form, a CLI, or a remote evaluator may complete the same Program under a different
Environment without changing its meaning.

Applications may register several Assistants and nominate one default. Omitting an Assistant address
preserves today's behavior by routing to that default. Explicit addressing is required when a UI,
CLI, or Runtime wants another receiver; hidden route-dependent switching would make Activity,
authority, and Session history difficult to explain. Context such as the selected screen or Entity
may vary within one Assistant, while materially different capabilities, provider choices, durable
memory, or behavior usually justify a distinct Assistant identity.

Provider selection belongs to the Assistant frontend or Environment and may be static or resolved
per Principal or Session. Credentials remain receiver-owned. A Provider performs inference; it does
not grant graph capabilities, choose authority, own Session state, or define the semantic Program.

### Execution strategy and LangGraph

The current model-backed flow is a **one-inference interpreter**, not a one-step workflow:

```text
interpret once
  -> choice Interaction if needed
  -> approval Interaction if required
  -> execute the selected canonical request
  -> complete
```

It can already span several durable Task steps and user turns. After a choice, execution resumes from
the stored canonical alternatives without calling the model again. The native Task Runtime and the
LangGraph Task Runtime adapter execute the same explicit Ontahí state machine. LangGraph currently
supplies checkpoint, replay, and interrupt/resume mechanics; it is not currently an LLM tool loop.

A future agentic execution strategy could instead repeat inference and evaluation:

```text
model proposes Program or tool application
  -> Ontahí validates and evaluates it
  -> result returns to the model
  -> model proposes another term
  -> ... until terminal result or bounded stop
```

LangGraph could implement that loop, but it is neither required by Assistant identity nor allowed to
create a parallel tool language. Tools should project completable Ontahí Programs, and each effect
still lowers through canonical dispatch and authority. A non-agentic Assistant may remain live across
many messages while using the simpler one-inference strategy for every Program Run.

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

### Relationship navigation as Selection composition

Graph relationships provide another Query surface for open programs. A concise authoring form may
read:

```text
TodoItem related via list to ?list
```

`list` names the declared relationship or reference path; `?list` is the missing endpoint value.
The expression denotes an open Selection, so other programs may consume it directly:

```text
delete (TodoItem related via list to ?list)

observe (TodoItem related via list to ?list)
```

After substituting a Todo List Ref, the first expression becomes a closed selection-targeted Graph
Command and the second becomes a closed reactive Query. The Selection remains first-class rather
than being materialized into IDs by the authoring surface.

Multi-hop navigation and nested selections should compose through the same model. One possible
surface for “authors of movies whose genre is among my three favorites” is:

```text
Author related via movies to (
  Movie whose genre in (
    CurrentUser.preferredGenres
      order by preference descending
      limit 3
  )
)
```

This requires relationship traversal, contextual roots, ordering, limiting, and a semi-join, but it
does not require a new kernel term for each phrase. `related`, `whose`, and `in` belong to the
Selection expression algebra; the semantic kernel supplies typed composition, holes, substitution,
evaluation, and observation around that algebra.

The language must not interpret `related` as arbitrary transitive graph reachability. A direct
relationship may be inferred only when the reflected model supplies one unambiguous path. Multiple
paths require an explicit relation name or a typed resolution step. Multi-hop traversal remains
explicit, bounded, authorized at each graph boundary, and available to execution planning for
pushdown or delegation.

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
  sendEmail(users = User.all where wantsBookNotifications, book)
```

The inline Query is a first-class argument rather than a procedural temporary. The boolean
predicate is shorthand for `wantsBookNotifications = true`; an evaluator may resolve that argument
where the User graph capability lives before dispatching the email effect.

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
13. Assistant identity, Session identity, Program Run identity, Task Run identity, transport
    session identity, and Principal remain distinguishable and causally linked.
14. Addressing an Assistant cannot select or manufacture the caller's Principal.
15. Concurrent Program Runs cannot mutate shared Session or Assistant state without an explicit,
    authorized, consistency-aware effect.
16. Provider credentials, private prompts, and long-term memory remain receiver-owned disclosures,
    not portable Program values by default.

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
9. Plan 153d proves that native and LangGraph Task Runtimes can execute the same explicit steps;
   it deliberately does not yet implement an LLM tool loop.
10. Plan 142h owns concrete deployment topology, consistency, and convergence work.

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
12. Model the current implicit default model participant as a compatibility case for explicit
    Assistant registration and addressing.
13. Specify Assistant, Session, and Program Run state boundaries, including sequential, concurrent,
    participant-initiated, and autonomous runs.
14. Compare one-inference, explicit workflow, and bounded model-tool-loop execution strategies
    without making LangGraph or one Provider semantic.
15. Extract implementation subplans rather than shipping the full hypothesis in one intervention.

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
13. Do not build a general autonomous-agent platform before explicit Assistant and Session identity
    boundaries are validated.
14. Do not treat Assistant memory, conversation history, Program substitutions, or provider threads
    as interchangeable state.
15. Do not require LangGraph for a live Assistant or equate durable multi-step execution with an
    agentic model-tool loop.

## Execution Slices

### Slice 0: Semantic Inventory And Compatibility Baseline

- [ ] Map every current semantic AST and evaluator to candidate kernel terms.
- [ ] Record current TypeScript inference, reflection, serialization, and runtime guarantees that
      cannot regress.
- [ ] Define conformance examples for closed Read, Command, and Operation applications.
- [ ] Identify apparent unifications that would only rename or wrap existing concepts.
- [ ] Inventory Principal, Task actor, Assistant, Session, Program Run, Task Run, Interaction,
      provider thread, and transport session identities without collapsing them.
- [ ] Describe today's `createApplicationModelCommandRuntime` as one implicit default Assistant and
      preserve that source-level compatibility while the new boundary remains experimental.

### Slice 1: Operation Application And Typed Holes

- [x] Define an internal open Operation application representation.
- [x] Infer argument types from the existing Operation input schema.
- [x] Normalize omitted required inputs into holes while preserving optional/default semantics.
- [x] Support explicit and named holes without exposing duplicate contract metadata.
- [x] Validate substitution and lower only a closed application into `OperationInvokeRequest`.
- [x] Prove the local application lifecycle with `TodoList.completeAll(list = ?list)`.

### Slice 2: Resolution And Generic Projection

- [x] Resolve direct Entity Ref holes through the existing authorized Graph Read dispatcher and the
      authoritative Operation input schema.
- [x] Auto-bind one authorized candidate, preserve several as a neutral choice, and keep zero or
      denied candidates unresolved.
- [x] Project one prepared choice to both a generic form field and the existing Task choice
      Interaction without changing the open application.
- [x] Accept one shared option identity through schema-validated substitution while retaining the
      selected candidate's provenance.
- [x] Define a replaceable resolver contract that consumes a Hole context with its authoritative
      Operation schema positions.
- [x] Separate candidate discovery, auto-binding, choice, free input, and unresolved outcomes.
- [ ] Declare reusable Entity Ref presentation and input-position candidate restrictions.
- [ ] Render the same open application as a generic form, CLI-style prompt, and conversational
      Interaction without changing its semantics.
- [x] Record provenance for accepted authorized-candidate and free-input substitutions.
- [ ] Prove that two Assistants can use different resolver and presentation policies for the same
      hole without changing the Program representation.

### Slice 3: Read And Command Generalization

- [x] Represent one parameterized Graph Read with a named hole.
- [x] Represent one Graph Command target or value hole.
- [ ] Represent a relationship-traversal Selection with a missing endpoint Ref.
- [ ] Apply one delete or update Command directly to the completed Selection.
- [ ] Compose one contextual multi-hop Selection with ordering, limiting, and a relation predicate.
- [x] Reuse substitution and validation without weakening cardinality, mutation, or authority rules.
- [x] Lower closed terms to the current Graph Read and Graph Command requests unchanged.
- [x] Validate a named Graph Read hole against every predicate position it occupies and lower the
      closed application to the current `GraphReadRequest` unchanged.
- [x] Expose every Graph Read Hole's Entity and Field positions so resolvers and presentation
      adapters can derive input semantics from the authoritative application schema.
- [x] Decide whether one common Application abstraction is real or should remain a family of typed
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
- [ ] Keep Session continuity separate from the Program Run continuation being resumed.

### Slice 6: Bounded Distributed Evaluation

- [ ] Define evaluator capability discovery and explicit unsupported-term behavior.
- [ ] Delegate one closed read-only subcomputation between two runtimes.
- [ ] Delegate one typed hole resolution and return an inspectable substitution.
- [ ] Preserve authority, cancellation, provenance, model compatibility, and causal identity.
- [ ] Keep execution placement separate from authored semantic meaning.

### Slice 7: Assistants, Frontends, Models, And Tooling

- [x] Project one open Graph Read application through the existing TS and declarative Console
      dialects, bind its named Holes in Devtools, and execute only the closed canonical request.
- [ ] Treat TypeScript, declarative text, projectional editing, UI forms, CLI, and natural language as
      frontends producing the same semantic terms.
- [ ] Define explicit Assistant registration, stable addressing, and one application default without
      making an Assistant a new authority kind.
- [ ] Separate Assistant state, Session state, and Program Run state in reflection and Activity.
- [ ] Allow several messages and independently tracked Program Runs within one Session, including a
      bounded concurrent-run case.
- [ ] Compare provider and execution-strategy selection across two Assistants while keeping provider
      credentials and checkpoints private.
- [ ] Project model tools from closed or completable Ontahí applications rather than creating a
      parallel tool vocabulary.
- [ ] Let a model propose terms and substitutions under the ordinary resolver and authority rules.
- [ ] Demonstrate one bounded agentic loop as an optional execution strategy only after the same
      tools exist as Ontahí Program projections.
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
TodoList.completeAll()
```

1. Reflection resolves the existing Operation and input schema.
2. Normalization produces one typed `list` hole from the required input.
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

### First Operation Application Checkpoint

Implemented on 2026-10-02: Core now has an internal, deliberately unexported Operation application
experiment. Its argument tree contains only value and Hole terms; the existing Operation input
schema remains the sole contract. Required omissions become typed positional Holes, while optional
and defaulted omissions remain absent and explicit `null` remains a value. Named Hole substitution
is immutable and validates every matching position. Open applications cannot lower to an executable
request; a closed application is parsed by the original schema and lowers to the unchanged
`OperationInvokeRequest`, including schema defaults and canonical Entity Refs.

The local proof uses the input shape of `TodoList.completeAll(list = ?list)`. It does not yet add a
resolver, Interaction, textual syntax, DevTools projection, transport form, or public Core API.
Those remain Slice 2 work.

### First Authorized Resolution Checkpoint

Implemented on 2026-10-02: the internal experiment can now resolve a direct Entity Ref Hole against
the actual Operation registered in an application graph. Candidate discovery projects only the
target Entity's canonical identity and runs through the existing Graph Read dispatcher with the
caller's authority and policy scope. One candidate is substituted automatically, several remain a
presentation-neutral choice, and zero, denied, malformed, unsupported, or unavailable results keep
the application open. Accepted candidates carry Graph Read provenance and still pass through the
Operation schema before lowering to `OperationInvokeRequest`.

This checkpoint deliberately supports only direct Entity Ref positions. It does not add scalar
free input, nested Ref discovery, presentation metadata, generic resolver chains, UI projection,
or a public Core export. The receiver must still authorize the lowered invocation at execution
time; candidate visibility grants no Operation authority.

### First Generic Projection Checkpoint

Implemented on 2026-10-02: a presentation policy can prepare the resolver's neutral multi-candidate
choice without modifying the open application or its candidates. The prepared choice projects to
both a generic form field and the existing Task choice Interaction request. Both surfaces expose
the same option identities; selecting one performs the original schema-validated substitution and
returns the accepted candidate with its authorized Graph Read provenance. Invalid, empty, or
duplicate presentation identities fail before a surface can present an ambiguous choice.

Prompt text and candidate labels are presentation policy, so two callers can describe the same
application differently without changing its semantics. This checkpoint does not yet provide a
CLI projection, reusable Entity display fields, scalar free input, Assistant configuration, Task
persistence, or a public form contract. Those broader Slice 2 items remain open.

### Replaceable Resolver And Free Input Checkpoint

Implemented on 2026-10-02: Hole resolution now has an internal replaceable resolver contract. The
coordinator derives every named-Hole position and its original schema from the Operation contract,
then offers that immutable context to ordered resolvers. A resolver may return an outcome or
abstain; changing resolver policy does not change the authored application. Exhaustion is an
explicit unresolved outcome rather than an implicit failure.

The authorized Entity Ref discovery path adapts to this contract, and a second resolver recognizes
direct scalar fields as free input. Submitted free input uses the same substitution and Operation
schema validation as every other binding and records `free-input` provenance. Composite, mixed,
unknown, stale, or unsupported positions remain unresolved. This checkpoint does not add nested
input traversal, contextual auto-values, UI controls, model authority, or public exports.

### First Parameterized Graph Read Checkpoint

Implemented on 2026-10-02: an internal Graph Read application can replace one or more scalar
predicate values with the same named Hole while preserving the request's boolean Selection tree,
ordering, limit, mode, and other protocol fields. Substitution is immutable and validates the
candidate against every Entity field schema occupied by that Hole. An open application cannot
lower; after all Holes are bound, parsing and Entity resolution produce the existing canonical
`GraphReadRequest` without a second execution protocol.

This first Read proof deliberately excludes `in` predicates, missing relationship endpoints,
computed producers, observation, Graph Commands, dispatch, and public exports. It tests the shared
open/validate/close mechanics without claiming that Operation and Graph Read applications already
form one public abstraction.

### First Console Projection Checkpoint

Implemented on 2026-10-02: the existing TS and declarative Console dialects accept a named Hole in
a Graph Read predicate (`Tag.where(name = ?wanted).many()` and
`Tag where name = ?wanted`). Analysis produces the same typed open Graph Read application rather
than an executable request. Devtools projects every named Hole as an explicit input, validates and
normalizes substitutions through the Entity field schema, and enables Run only after the
application lowers to the unchanged canonical `GraphReadRequest`. Execution then uses the ordinary
Runtime Protocol and receiver policy path.

This checkpoint introduces a bounded experimental Core subpath for semantic-program frontends; it
does not export the experiment from the stable Core root or claim a universal Application type.
Observation remains closed-request-only, and richer resolver-driven inputs, relationship endpoint
Holes, projectional editing, CLI, and natural-language frontends remain later work.

### First Parameterized Graph Command Checkpoint

Implemented on 2026-10-02: an internal Graph Command application can replace one or more Entity
create or update payload values with the same named Hole. Substitution validates and normalizes the
candidate independently against every occupied Entity field schema, preserves the mutation target
and all other request fields, and remains immutable. Open Commands cannot lower; closed Commands
parse and resolve to the existing `GraphCommandRequest`, leaving execution and receiver-owned
authorization on the current dispatcher path.

The three proofs now justify a common named-Hole term and the same open/validate/substitute/close
discipline, but not one universal Application representation. Operation inputs, Graph Read
predicates, and Graph Command payloads retain distinct typed application shapes and traversal rules.
This checkpoint deliberately excludes delete payloads, target Holes, relationship Commands,
conditional mutation values, dispatch, public exports, and console integration.

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

## Assistant And Session Proof

After the Operation/resolution boundary is stable, reinterpret current Model Support as one default
Assistant rather than adding an independent agent framework. The proof should register two
Assistants over the same application:

```text
todo-assistant
  provider = local model
  capabilities = Todo reads and mutations
  grounding = Todo display/search and authorized context

planning-assistant
  provider = different model or configuration
  capabilities = read-oriented planning surface
  grounding = planning context
```

It must demonstrate:

1. an omitted Assistant address routes to the declared default;
2. an explicit address selects another Assistant and appears in Activity;
3. the same Principal starts both runs without Assistant identity becoming authority;
4. one Session accepts several messages and retains only declared Session state;
5. two concurrent Program Runs remain independently cancellable, inspectable, and resumable;
6. one open Program can be projected or resolved differently by each Assistant Environment while
   retaining the same Program identity and contract;
7. native and LangGraph Task Runtime adapters preserve the same Assistant, Session, Program Run,
   Interaction, and canonical effect identities;
8. an optional bounded model-tool loop, if included, uses projected Ontahí Programs and does not
   expose LangGraph tools or provider threads as the public contract.

This proof may begin with static Assistant definitions. Persisted user-created Assistant instances,
long-term memory stores, autonomous schedules, and dynamic installation are later concerns. The
first result should clarify identity and state ownership rather than maximize agent features.

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
11. Identity tests proving Assistant addressing cannot alter Principal, Session, Program Run, or
    Interaction authorization.
12. State-isolation tests covering several messages, concurrent runs, restart, cancellation, and
    explicit promotion of Run output into Session or Assistant state.
13. Execution-strategy conformance proving native steps, LangGraph-backed steps, and any bounded
    agentic loop expose the same semantic and Activity boundaries.

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
- [ ] One application registers a default and a second explicitly addressed Assistant.
- [ ] Assistant, Session, Program Run, Task actor, and Principal identities remain distinct and
      inspectable across restart and concurrent runs.
- [ ] A live Assistant can receive multiple messages without requiring one endless workflow or
      conflating its state with conversation history.
- [ ] Native and LangGraph execution preserve the same public Assistant and Program semantics.
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
7. `154g`: assistants, sessions, semantic frontends, model projection, and DevTools inspection.

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
21. Is `Assistant` the durable public name, or should it remain one kind of semantic participant?
22. Which Assistant configuration is definition-time code, persisted instance data, or Session
    override, and how is each versioned?
23. What is the minimal Session contract shared by browser, CLI, voice, and background triggers?
24. Which history or result promotion is explicit Assistant memory rather than transient Session or
    Program Run state?
25. How are concurrent runs ordered, isolated, cancelled, or joined when they share one Session?
26. Does an autonomous trigger address an existing Assistant instance, instantiate a profile, or
    invoke a separate service identity?
27. Which execution-strategy contract can cover one-inference interpretation, explicit workflows,
    and bounded agentic loops without exposing LangGraph internals?

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
13. Current Model Support is treated as one implicit default Assistant whose message starts one
    bounded Program Run; compatibility does not require an Assistant address yet.
14. Assistant, Session, and Program Run state are separate domains, and Task `actor` continues to
    mean the authenticated causal identity rather than the Assistant receiver.
15. A live Assistant may start many sequential or concurrent runs; it is not modeled as one endless
    Task or one mutable provider thread.
16. LangGraph remains an optional Task Runtime or future execution-strategy implementation, not the
    semantic owner of Assistant identity, Session state, tools, or Programs.
17. Assistant configuration supplies an Environment and frontends; it does not enter hole identity,
    duplicate schema contracts, or grant authority.
