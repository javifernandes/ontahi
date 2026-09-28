# 153c. Interactive And Resumable Operation Execution

Status: current

Canonical ID: `ontahi://plans/153c-operation-interactions-and-resumption`

Shapes: [Operation Interaction](../../atlas/items/model/operation-interaction.md),
[Durable Operation](../../atlas/items/model/durable-operation.md),
[Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md).

Related plans:

1. [125. Ontahí AI Operations](../research/125-ontahi-ai-operations.md)
2. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)
3. [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)
4. [153. Model-Backed Todo Command Spike](../current/153-model-backed-todo-command-spike.md)
5. [153a. Model Execution Security And Authorization](../backlog/153a-model-execution-security-and-authorization.md)
6. [153b. Declarative Operation Context Scope](../backlog/153b-declarative-operation-context-scope.md)

## Summary And Research Question

The first Model Support work exposed a more fundamental need. An Ontahí Operation may have to read
the graph, issue graph commands, invoke another Operation, report progress, and obtain a typed
response from an external participant before it can produce its normal typed result. That need is
independent of whether code, a model, a workflow engine, or an external system decides the next
step.

This research therefore reframes the original “conversation” problem as **interactive and
resumable Operation execution**. A model is one possible executor or intent resolver. It does not
own interaction, continuation, authorization, or durable execution semantics.

The smallest promising direction is:

1. keep Graph Read, Graph Command, and Operation Invocation as the canonical semantic requests they
   already are;
2. add one missing semantic primitive: a typed Interaction request and reply;
3. let an Operation run expose a pending Interaction and later continue after one valid reply;
4. keep checkpointing, replay, state-machine execution, and workflow products behind runtime
   adapters;
5. keep model provider calls, prompts, tool projection, and model memory in Model Support.

This is a research conclusion, not a frozen public API. The async examples below express desired
semantics. Persisting an arbitrary JavaScript stack across suspension is not currently implemented
and cannot be assumed.

## Current-State Inventory

### Operation contract and execution

An Ontahí Domain Operation already owns stable identity, typed input and output, failures,
requirements, conditions, execution metadata, exposure, and implementation. The server Operation
runner in `packages/core/src/runtime/server/operation/runner.ts` establishes an invocation context,
runs requirements and conditions, applies concerns, optionally opens an atomic data-graph unit of
work, executes the body, and invalidates declared cache dependencies after success.

Operation bodies already compose graph behavior directly. They may return or execute Selections,
Commands, and Effects, and one Operation may call another through the application facade. These
capabilities should not be renamed or wrapped in a second symmetric “tool” API merely because a
model may consume them.

The current `OperationInvocationResult` is terminal: success, invalid input, rejected before
execution, failed after execution, or errored with unknown execution status. It has no explicit
accepted, waiting, or resumable variant. A durable start represents acceptance as a successful
value containing `TaskRunRef`; immediate Operation invocation has no stable run identity.

### Canonical protocol requests

Ontahí already has transport-independent representations for:

| Semantic capability      | Current canonical form                          | Runtime owner                         |
| ------------------------ | ----------------------------------------------- | ------------------------------------- |
| Graph Read               | `GraphReadRequest`                              | policy-aware Graph Read dispatcher    |
| Graph Command            | `GraphCommandRequest`                           | policy-aware Graph Command dispatcher |
| Operation invocation     | `OperationInvokeRequest`                        | Operation invocation dispatcher       |
| Permission check         | `OperationPermissionRequest`                    | Operation invocation dispatcher       |
| Durable observation      | `TaskRunIdentity` plus inspect/observe protocol | Task Runtime                          |
| Natural-language ingress | `model.command` request                         | model-command runtime                 |

The versioned Runtime Protocol registers these as separate families and can transport them over
Fetch or WebSocket. Authority is derived by the host and does not travel as user-controlled payload.
Runtime Transport instrumentation already records them in Devtools Activity.

### Durable Operations and Task Runtime

A durable Operation projects to a `TaskDefinition`. Starting it returns a `TaskRunRef` with
`taskId` and `runId`; observation returns snapshots with queued, running, completed, failed, or
cancelled state, progress, and eventual result. The Task Context supports progress, sleep, and
declared steps.

This is substantial prior structure for interactive runs, but it does not yet provide interaction:

- there is no `waiting` state or pending-interaction projection;
- there is no reply/continue protocol;
- neither the in-process nor Vercel Workflow executor implements a participant wait;
- the in-process executor starts a background promise and cannot survive process loss;
- `cancelled` is observable but there is no shared cancellation command;
- durable idempotency policies are reflected but not yet enforced;
- a supplied `runId` does not currently establish complete deduplication or replay semantics.

An interactive run probably reuses or generalizes this lifecycle. It must not be modeled as a chat
message exchange beside it.

### Identity and authority

Current invocation context carries an authenticated `Principal | null`, cache scope, and runtime
resources. Task metadata separately records an optional actor, ingress details, subject, task ID,
and run ID. WebSocket protocol sessions have connection-local request and observation identities.

The repository already has evidence that these identities are different. No existing identifier is
sufficient by itself for an interactive execution:

| Identity                 | Meaning                                                        | Must not imply                                  |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------- |
| Principal                | authenticated security identity                                | UI surface, conversation, or permission forever |
| Participant              | intended or eligible responder role                            | authenticated identity or authority             |
| Transport session        | one HTTP request, socket, CLI process, or browser connection   | durable run ownership                           |
| Interaction session      | optional host correlation across related interactions/surfaces | execution state or authority                    |
| Operation invocation     | one request to start or call an Operation                      | a durable run necessarily exists                |
| Execution run            | one accepted execution with durable lifecycle                  | a single transport connection                   |
| Interaction              | one pending typed question/decision within a run               | the whole conversation or run                   |
| Continuation handle      | opaque means to address a pending continuation                 | a credential or Principal                       |
| Model conversation state | executor-private working context                               | domain truth or Operation identity              |

### What the Model Support checkpoint established

Merged PRs [#168](https://github.com/javifernandes/ontahi/pull/168),
[#170](https://github.com/javifernandes/ontahi/pull/170),
[#171](https://github.com/javifernandes/ontahi/pull/171),
[#172](https://github.com/javifernandes/ontahi/pull/172), and
[#176](https://github.com/javifernandes/ontahi/pull/176) established a useful but narrower system:

1. natural language is interpreted into an existing Graph Read, Graph Command, or Operation Invoke
   request;
2. model output is a proposal, validated against explicit current scope before canonical dispatch;
3. dispatch uses the caller's existing authority and policy-aware application services;
4. Graph Reads return actual stored results rather than answers guessed from prompt context;
5. `model.command` is a versioned Runtime Protocol family and appears in Devtools Activity together
   with its canonical request and result;
6. provider-neutral orchestration, application binding, and the fetch-based Ollama provider are now
   reusable Core facilities;
7. Todo still owns its model-visible projection, allowed operations/reads/commands, additional
   validators, and user-facing messages.

The current implementation is best described as **single-turn fuzzy ingress followed by at most
one canonical dispatch**. Despite the broader research name “Model-Backed Operation Execution,” it
does not yet route an already-selected Operation to an LLM executor, run a model/tool loop, suspend
an Operation, or resume a conversation. `answered` and `unresolved` are terminal message results.

That distinction matters. The current code is evidence for canonical capability projection and
safe dispatch, not yet evidence that `model.command` should become the general interaction
protocol.

## LangGraph Prior Art

This review uses current LangGraph.js documentation and source as of 2026-09-28. LangGraph.js is an
[MIT-licensed](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE) open-source runtime
that can be used standalone. LangSmith observability, evaluation, and hosted deployment are
adjacent products and are not architectural prerequisites for this research.

### Concept mapping

| LangGraph concept           | Closest Ontahí concept                                      | Useful overlap                                 | Semantic mismatch                                                                                        | Recommendation                                            |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `StateGraph`, nodes, edges  | Operation implementation or workflow runtime                | explicit state transitions and routing         | Ontahí's public center is the Operation and semantic graph capabilities, not a control-flow graph        | learn from; do not adopt as public ontology               |
| Graph state                 | run-private execution state                                 | checkpointable working state                   | Entity state is authoritative domain state; model/workflow state is not                                  | keep private to executor/runtime                          |
| Node/task                   | durable step or executor-internal step                      | retry and checkpoint boundary                  | not every Operation composition needs a named node                                                       | adapter detail unless explicitly declared as durable step |
| `Command({ update, goto })` | no direct equivalent                                        | combines state update with dynamic routing     | conflicts in name and meaning with Ontahí Graph Command                                                  | avoid exposing across adapter boundary                    |
| Agent/tool loop             | model executor using allowed capabilities                   | dynamic choice of next capability              | LangGraph tools can become a parallel domain API                                                         | project Ontahí Read/Command/Invoke/Interaction as tools   |
| Checkpointer                | Task Runtime persistence or future execution store          | snapshots, pending writes, recovery            | current Ontahí Task snapshots store lifecycle, not complete replay state                                 | adapt behind an execution-runtime interface               |
| Thread / `thread_id`        | partially run ID, checkpoint cursor, and conversation state | stable checkpoint lookup                       | collapses identities Ontahí must distinguish                                                             | map internally; never expose as universal Ontahí identity |
| `interrupt(value)`          | proposed Interaction plus suspension                        | dynamic pause, external response, later resume | payload and reply are generic JSON; interaction semantics and authorization are application/runtime work | adapt after Ontahí validates typed request/reply          |
| `Command({ resume })`       | proposed interaction response                               | resumes the matching checkpoint                | tied to LangGraph thread/checkpoint and node replay                                                      | adapter implementation of an Ontahí reply                 |
| Stream modes                | progress/activity/result projections                        | values, updates, messages, custom events       | token streams are model-specific; Ontahí progress is executor-neutral                                    | map selected events to Ontahí observation                 |
| Store                       | cross-thread runtime memory                                 | long-lived non-checkpoint data                 | not automatically authoritative domain state                                                             | optional runtime resource, separate from Entities         |
| Subgraph                    | nested workflow or invoked Operation                        | composition and namespaced state               | graph topology is not Operation identity                                                                 | possible adapter technique for nested execution           |
| Retry policy                | runtime retry policy                                        | transient recovery, backoff, timeouts          | retry safety depends on Ontahí invocation/effect idempotency                                             | borrow mechanics only after semantic classification       |

LangGraph distinguishes workflows with predetermined paths from agents that dynamically choose
their process and tools. Its common agent loop alternates an LLM node with `ToolNode` until the
model stops requesting tools; `ToolNode` supplies parallel execution, error handling, and state
injection. Ontahí can reuse that loop shape inside a model executor, but the registered tools should
be projections of already-authorized Ontahí capabilities. `ToolNode` convenience must not decide
domain authority or create a provider-specific action vocabulary.

### Interrupt and resume semantics

LangGraph's [interrupt documentation](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
shows the most relevant behavior:

1. a checkpointer and `thread_id` are required;
2. `interrupt(payload)` surfaces a JSON-serializable payload and pauses the graph;
3. resuming with `Command({ resume: value })` makes that value the return value of `interrupt()`;
4. the interrupted node restarts from its beginning on resume;
5. code before the interrupt can run again, so side effects must be idempotent or separated into
   checkpointed tasks/nodes;
6. multiple concurrent interrupts have stable IDs and can be resumed by an ID-to-value map;
7. graph definition changes are constrained while runs are interrupted.

The functional API similarly replays an entrypoint from the beginning while loading completed task
results from checkpoints. Non-determinism and side effects must be isolated in checkpointed tasks.
This is replay, not serialization of the JavaScript call stack.

This solves hard runtime plumbing, but not Ontahí's semantic questions. A JSON interrupt does not
say whether a response is clarification, choice, approval, credential input, or an external-system
callback. It does not define who may reply, whether approval binds exact effects, how current
authority is rechecked, or what an application should render.

### Persistence, memory, retries, and streaming

LangGraph [checkpointers](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md)
save state at superstep boundaries under a thread. They enable resume, time travel, fault tolerance,
and thread-scoped memory. Separate Stores hold data across threads. Ontahí should preserve the same
useful separation in its own vocabulary:

- execution checkpoints recover a run;
- interaction records coordinate external replies;
- model conversation/working memory belongs to an executor workspace;
- cross-run preferences or memories are runtime/application resources;
- authoritative domain state remains in Entities and external systems reached through declared
  capabilities.

LangGraph's [fault-tolerance model](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/fault-tolerance.mdx)
offers per-node retries, timeouts, error handlers, and resumable graceful drain. Ontahí cannot copy
the retry defaults blindly. A model call, Graph Read, idempotent Graph Command, non-idempotent
external effect, and participant Interaction require different retry semantics.

LangGraph [streaming](https://docs.langchain.com/oss/javascript/langgraph/streaming) separates state
updates, full values, model messages, custom events, and debug output. Ontahí should likewise avoid
one undifferentiated event stream. Operation progress, lifecycle transitions, Activity evidence,
model tokens, and pending Interactions are different projections with different retention and
security rules.

### Subgraphs and nested execution

LangGraph subgraphs support state isolation, shared-state composition, namespace-aware streaming,
and parent routing. They are useful implementation prior art for nested Operations. Ontahí should
still preserve a canonical nested `OperationInvokeRequest`, child run identity when durable, and an
explicit parent/child relationship. A subgraph namespace is not a substitute for those semantic
links.

## Execution Model Analysis

### Code-backed and model-backed execution

Both executor types should consume the same application capabilities and eventually return the
Operation's declared output:

```text
                        Operation Invocation
                                  |
                     authority + runtime policy
                                  |
            +---------------------+--------------------+
            |                     |                    |
        code executor        model executor      workflow/other
            |                     |                    |
            +---------------------+--------------------+
                                  |
                canonical capabilities + Interaction
                                  |
             Read       Command       Invoke       Interact
```

A code executor chooses the next step through program control flow. A model executor chooses it
through inference and structured tool calls. A workflow engine chooses it through stored workflow
state. The choice mechanism differs; the semantic capabilities and runtime enforcement should not.

For a model executor, a “tool” is therefore a provider-facing projection:

```text
model tool call
  -> parse and validate provider output
  -> Ontahí canonical request or Interaction request
  -> authorize and dispatch in the runtime
  -> project the actual result back to the executor
```

The provider tool name, message format, and tool-call ID stay inside the adapter. They must not
become alternate Entity, Command, or Operation identities.

### Is this an execution effect system?

There is an effect-like pattern, but a new universal `ExecutionEffect` AST would currently do more
harm than good.

| Candidate        | Classification                                             | Reason                                                                             |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Graph Read       | existing canonical semantic request and runtime capability | already has selection, protocol, policies, results, and transport                  |
| Graph Command    | existing canonical graph effect/request                    | wrapping it would duplicate command semantics                                      |
| Operation Invoke | existing canonical semantic request                        | already names composition and dispatch                                             |
| Interaction      | missing semantic request/reply primitive                   | genuinely new boundary between execution and an external participant               |
| Progress/Emit    | lifecycle observation                                      | does not ask the environment for a value and should not be confused with a command |
| Wait/Suspend     | runtime lifecycle mechanic                                 | describes what execution does while an Interaction or timer is unresolved          |
| Sleep/timer      | runtime scheduling primitive                               | already exists for durable tasks and may be adapter-specific                       |

Internally, an executor may interpret all of these as effects. Publicly, Ontahí should prefer a
small **execution capability set** that reuses existing contracts and adds Interaction. This avoids
renaming stable concepts for symmetry and avoids collision with the repository's current
`OperationEffectsConfig`, which describes affected cache values.

### Interaction as a primitive

An Interaction is a typed request from one execution run to an eligible Participant. Its semantic
contract needs at least:

- stable interaction identity within a run;
- kind and response schema;
- presentation-neutral prompt and optional structured context;
- intended participant/audience policy;
- creation and optional expiry;
- pending/responded/expired/cancelled or superseded lifecycle;
- exactly one accepted response unless a declared interaction kind says otherwise;
- authenticated responder evidence, separate from the response value;
- correlation to the run and the checkpoint/continuation it may resume.

The first useful kinds should remain narrow:

1. `input`: obtain a typed value not already available;
2. `choice`: choose among stable option IDs/Refs, not labels alone;
3. `approval`: accept or reject a concrete, immutable proposal.

Approval is not a Boolean question with nicer rendering. Its subject must bind the exact proposed
effects, target identities, relevant preconditions or version/fingerprint, and expiry. A “yes” to a
list that later changed cannot silently approve newly matching targets. After approval, the runtime
still rechecks authority and staleness before dispatch.

`Participant` should be more general than “human.” A user, service, integration, policy engine, or
future external system may be eligible to respond. A Participant descriptor routes and constrains
the response; the `Principal` authenticated at reply time proves who is attempting it. Matching the
descriptor is necessary but does not replace authorization.

### Suspension and durable execution

The attractive API is intentionally deceptive:

```ts
async function moveStudent(input, ctx) {
  const candidates = await ctx.read(...);
  const course = await ctx.interact.choice(...);
  const accepted = await ctx.interact.approval(...);
  if (!accepted) return ...;
  return ctx.command(...);
}
```

An ordinary Promise cannot be persisted across a process restart. Supporting this source shape
requires one of four strategies:

1. keep the process and Promise alive, which is useful only for a non-durable local adapter;
2. compile or transform the function into a persisted state machine;
3. author an explicit state machine/generator interpreted by Ontahí;
4. delegate replay/checkpointing to a durable workflow runtime such as LangGraph or Vercel
   Workflow, isolating non-determinism and side effects in recorded steps.

The public semantics should not promise strategy 2 before it exists. The first experiment should
use an explicit resumable boundary or adapter and prove the Interaction contract. A future fluent
or `await` syntax can be projected once two runtimes support the same semantics.

Interactive execution implies a stable run even when the original Operation would otherwise be
immediate. This does not mean every Operation must be declared durable. It means that once an
execution suspends, the runtime must promote or start it as an observable run with identity,
persistence, and a terminal result. Research must decide whether this generalizes `TaskRun` into an
Operation execution run or extends the durable Operation contract. Creating a second parallel
“conversation run” would duplicate lifecycle and should be avoided.

### Resumption protocol

A continuation handle should address a pending Interaction, not serialize authority. Conceptually:

```ts
type InteractionReplyRequest = {
  run: { operationId: string; runId: string };
  interactionId: string;
  response: JsonValue;
  expectedRevision?: string;
};
```

On reply the host/runtime should, in order:

1. authenticate the current Principal independently of the handle;
2. load the run and pending Interaction;
3. reject missing, expired, cancelled, superseded, or already-answered requests;
4. verify that the current Principal may act as the requested Participant;
5. validate the response against the declared response schema and option set;
6. atomically accept one response using revision or compare-and-set semantics;
7. schedule resumption rather than executing arbitrary client-supplied continuation code;
8. re-establish current runtime resources and authority;
9. revalidate data and exact approved effects before applying them;
10. record the lifecycle transition and final result through normal run observation.

An invalid reply leaves the Interaction pending. A duplicate identical reply may return the already
accepted outcome; a conflicting second reply must not overwrite it. These are storage and protocol
guarantees, not UI heuristics.

## Boundary Recommendation

### Model Support owns

- provider adapters such as Ollama or OpenAI;
- prompt/message construction and structured-output parsing;
- projection of Ontahí capabilities as model tools;
- model-specific budgets, token streaming, retries, and evaluation;
- executor-private context, scratch state, and model conversation memory;
- fuzzy intent resolution from text/voice into canonical requests;
- model-backed execution as one Operation executor binding.

### Interactive/resumable execution owns

- Interaction declaration, response schema, participant policy, and lifecycle;
- execution run identity and parent/child links;
- pending Interaction observation and reply submission;
- suspend/resume behavior;
- progress and terminal result observation;
- persistence/checkpoint adapter boundary;
- cancellation, expiry, stale reply, and concurrent reply semantics;
- authorization and state rechecks on resume;
- replay/idempotency requirements for execution steps.

This layer should have no model provider types and should work for code-backed Operations.

### Existing semantic runtimes continue to own

- Graph Read parsing, policy, authorization, and execution;
- Graph Command parsing, policy, authorization, preconditions, and execution;
- Operation Invocation parsing, input validation, permission, dispatch, and result;
- Task/durable lifecycle where reused by interactive execution.

### Application and surfaces own

- which Participants may discover an Interaction;
- routing notifications to browser, CLI, mobile, chat, or another surface;
- rendering input, choice, and approval controls;
- collecting ambient surface context such as the selected Entity;
- explicitly correlating surfaces with an interaction session;
- accessibility, localization, and notification policy.

A surface submits a typed response. It does not resume code directly and does not convert ambient
selection into authority.

### Where a LangGraph adapter could live

LangGraph belongs behind the interactive/durable execution boundary, in an optional focused
package such as `@ontahi/runtime-langgraph`. It could implement checkpointing, node/task replay,
interrupt/resume, retries, streaming, and subgraph orchestration. It would receive Ontahí execution
capabilities and an Interaction adapter. It would not define Operation, Interaction, Graph Command,
Principal, or Runtime Protocol contracts.

An adapter maps identifiers approximately as follows:

```text
Ontahí execution run ID     -> LangGraph thread_id (adapter-private mapping)
Ontahí executor checkpoint  -> LangGraph checkpoint / namespace
Ontahí Interaction          -> interrupt(serialized request)
Ontahí accepted reply       -> Command({ resume: validatedResponse })
Ontahí progress             <- selected stream/custom events
Ontahí nested invocation    -> canonical invoke; optionally a subgraph internally
```

The mapping is intentionally one-way. An Ontahí client must not need to know `thread_id`, node
names, checkpoint namespaces, `Command.goto`, or LangGraph state channels.

## Minimal Conceptual API

The following types are design probes. Names and representation are not proposed as final exports.

```ts
type Participant =
  | { kind: 'principal'; subject: string }
  | { kind: 'role'; role: string }
  | { kind: 'service'; service: string };

type InteractionRequest<TResponse> = {
  id: string;
  run: ExecutionRunRef;
  kind: 'input' | 'choice' | 'approval';
  prompt: string;
  response: GraphSchema<TResponse>;
  participant: Participant;
  context?: JsonValue;
  expiresAt?: string;
};

type ChoiceInteraction<TValue> = InteractionRequest<TValue> & {
  kind: 'choice';
  options: ReadonlyArray<{
    id: string;
    label: string;
    value: TValue;
  }>;
};

type ApprovalInteraction = InteractionRequest<
  { decision: 'approve' } | { decision: 'reject'; reason?: string }
> & {
  kind: 'approval';
  proposal: {
    canonicalRequests: readonly CanonicalExecutionRequest[];
    fingerprint: string;
    summary?: string;
  };
};

type ExecutionCapabilities = {
  read(request: GraphReadRequest): Promise<GraphReadDispatchResponse>;
  command(request: GraphCommandRequest): Promise<GraphCommandDispatchResponse>;
  invoke(request: OperationInvokeRequest): Promise<OperationInvocationResponse>;
  interact: {
    request<T>(request: InteractionRequest<T>): Promise<T>;
  };
  progress(value: OperationProgress): Promise<void>;
};
```

The capability facade is executor-facing convenience. It delegates to existing dispatchers and
does not replace their protocols. A code Operation may eventually receive these through its
runtime context or Effect services; a model executor receives provider tool projections backed by
the same facade.

The observable run shape could evolve toward:

```ts
type ExecutionRunSnapshot<TResult> =
  | { status: 'queued' | 'running'; progress?: OperationProgress }
  | { status: 'waiting'; interactions: readonly PendingInteraction[] }
  | { status: 'completed'; result: TResult }
  | { status: 'failed'; error: RunError }
  | { status: 'cancelled'; reason?: string };
```

Whether `waiting` becomes a new Task status or a running snapshot with pending Interactions is an
open compatibility question. The protocol must expose pending Interaction identity either way.

## Worked Example: Delete Shopping Tasks

Request: “Delete the tasks from my shopping list.” Two visible lists are both named Shopping.

### Shared semantic execution

1. The Operation run issues an authorized Graph Read for candidate list Refs.
2. It creates `Interaction<Choice<TodoListRef>>` with two stable options.
3. The run becomes waiting. A host renders the choice in web, CLI, or Devtools.
4. An eligible Principal replies with one option ID. The runtime validates and atomically accepts
   the response.
5. The run resumes and issues a Graph Read for current tasks in that list.
6. It constructs exact deletion requests for the concrete item Refs and a fingerprint over the
   proposal. It does not ask approval for a mutable selection that could include later items.
7. It creates `Interaction<Approval>` containing the exact proposed effects and human summary.
8. The participant approves. The runtime re-authenticates, rechecks authority, reloads relevant
   state, and verifies the proposal fingerprint/preconditions.
9. The Operation dispatches the approved Graph Commands and returns its declared typed result.
10. The run reaches completed; normal cache invalidation and Activity evidence follow the actual
    commands/results.

Ontahí currently has no canonical multi-command transaction envelope. For multiple item deletions,
the Operation must either define sequential partial-failure semantics, use an existing atomic
domain Operation, or motivate a separate batch/transaction design. Interaction must not smuggle in
an unmodeled batch protocol.

### Code-backed executor

Conceptually:

```ts
const deleteShoppingTasks = operation.durable({
  input: O.object({ listName: f.string() }),
  output: DeleteTasksResult,
  *run(input, ctx) {
    const lists = yield* ctx.read(findListsNamed(input.listName));
    const list =
      lists.length === 1
        ? lists[0]
        : yield* ctx.interact.choice({
            id: 'choose-list',
            prompt: 'Which Shopping list?',
            options: lists.map(list => ({ id: list.id, label: list.name, value: list.ref })),
            response: TodoList.refSchema,
          });

    const tasks = yield* ctx.read(tasksIn(list));
    const proposal = exactDeleteRequests(tasks);
    const decision = yield* ctx.interact.approval({
      id: 'approve-delete',
      prompt: `Delete ${tasks.length} tasks from ${list.name}?`,
      proposal,
    });

    if (decision.decision === 'reject') return { deleted: 0, rejected: true };
    yield* ctx.verifyProposal(proposal);
    for (const request of proposal.canonicalRequests) yield* ctx.command(request);
    return { deleted: tasks.length, rejected: false };
  },
});
```

No LLM is involved. The runtime may implement the generator as an explicit state machine, replay
it through recorded steps, or delegate it to a workflow adapter.

### LLM-backed executor

The invoked Operation and its typed result remain the same. The model receives tools projected
from the executor's allowed capabilities:

```text
model calls graph.read(find candidate lists)
runtime returns two authorized Refs
model calls interaction.choice(typed options)
run waits; participant replies
model calls graph.read(tasks for chosen Ref)
model proposes exact graph.command requests
runtime/application policy requires interaction.approval(proposal)
run waits; participant approves
runtime revalidates and dispatches canonical commands
model or deterministic result projector returns DeleteTasksResult
```

The model can decide that a choice is needed, but it cannot invent the accepted response, grant
authority, mark its own proposal approved, or execute provider-native “tools” outside Ontahí
dispatch. Runtime policy may require approval even if the model does not request it.

Both executors therefore expose the same pending Interaction records and final Operation result.
Only their decision mechanism and private working state differ.

## LangGraph-Backed Variant

The same code-backed or model-backed workflow can be represented as LangGraph nodes:

```text
resolve candidate lists
  -> [one] read tasks
  -> [many] interrupt(choice)
  -> read tasks
  -> build exact proposal
  -> interrupt(approval)
  -> revalidate proposal
  -> dispatch commands
  -> final typed result
```

LangGraph would provide:

- checkpoint creation and lookup;
- replay from node/task boundaries;
- `interrupt()` and `Command({ resume })` plumbing;
- stable interrupt IDs and namespaced subgraph interrupts;
- retries, backoff, timeouts, and graceful drain at execution boundaries;
- streaming of state updates and custom events;
- optional subgraph composition.

Ontahí would still provide:

- the Operation's identity, input, output, failure, and exposure contract;
- execution-run and Interaction identities visible to Ontahí clients;
- Interaction kinds, typed response schemas, participant policy, expiry, and approval binding;
- current Principal and authorization checks;
- Graph Read, Graph Command, and Operation Invoke request parsing and dispatch;
- exact effect proposal and stale-state validation;
- Activity redaction and domain-level audit semantics;
- mapping between run/Interaction IDs and adapter-private thread/checkpoint/interrupt IDs;
- final `OperationInvocationResult` or durable run result.

The adapter would call `interrupt(serializedOntahiInteraction)` only after persisting the Ontahí
Interaction record. On resume, it would accept `Command({ resume })` only from a response already
authenticated, validated, and atomically accepted by Ontahí. LangGraph's generic interrupt payload
would not be the public protocol.

This variant highlights the main value of LangGraph: orchestration plumbing. It does not remove the
need for Ontahí semantics.

## Risks And Open Questions

### Persistence and evolution

- What is the minimal persisted run state: explicit program counter and values, event history, or
  adapter-native checkpoint reference?
- Can `TaskRun` evolve without conflating task definition identity with Operation identity?
- How are interaction schemas and executable code versioned while old runs are waiting?
- What retention and deletion policy applies to checkpoints, responses, and sensitive prompts?

### Replay and nondeterminism

- Which calls are recorded steps and which are safely repeatable?
- How are time, random IDs, model calls, external APIs, and Graph Reads replayed?
- Does resume rerun Reads and deliberately observe fresh state, or replay prior values until an
  explicit revalidation step?
- How does a model executor resume without pretending inference is deterministic?

### Retry and external effects

- Retry policy must distinguish read-only, idempotent, conditionally idempotent, and non-idempotent
  effects.
- Operation Invocation currently lacks complete durable invocation/delivery identity; plan 132 is
  a prerequisite for strong automatic retries.
- A retry after partial multi-command execution needs explicit compensation or partial-result
  semantics.

### Authorization and participants

- Is participant eligibility declared on the Operation, Interaction, application policy, or all
  three with narrowing rules?
- Which Principal owns or may observe a run started anonymously or by a service?
- Resume must reconstruct current authority and runtime resources, not persist credentials in a
  continuation token.
- Approval should expire or fail closed when permissions or relevant targets change.

### Staleness and approval

- Exact Ref identity alone is insufficient if fields or relationships relevant to approval change.
- Fingerprints, revisions, conditional commands, or a fresh approval may be required.
- A selection-based delete can affect new members added after approval; approvals need concrete
  targets or explicit dynamic-scope semantics.

### Concurrent responses

- The Interaction store needs compare-and-set acceptance so only one response wins.
- Decide idempotent behavior for repeated identical responses and diagnostics for conflicting ones.
- Parallel pending Interactions require stable IDs and may have dependency/cancellation rules.

### Cross-surface continuation

- Browser and CLI may discover the same pending Interaction only through explicit application
  correlation and visibility policy.
- “This list” requires fresh, surface-scoped context and resolves to a concrete Ref before reply.
- A connection ID or Principal alone cannot choose among multiple tabs, CLIs, or conversations.

### Nested Operations

- A parent may wait on a child durable Operation or expose a child's Interaction. The protocol must
  preserve parent run, child run, and interaction ownership.
- Cancellation and failure propagation need declared rules; subgraph namespace behavior should not
  leak into semantic identity.

### Cancellation and expiry

- Who may cancel a run or an individual Interaction?
- Does interaction expiry fail the run, choose a default, route to another participant, or emit a
  typed Operation failure?
- Cancellation must coordinate active model calls, graph dispatch, workflow checkpoints, and
  observers without claiming rollback of completed effects.

### Model context and memory

- Model prompt/context is executor input, not the execution checkpoint by definition.
- Conversation history may be a projection of run events, private model state, or both; it must not
  become authoritative domain state accidentally.
- Redaction, retention, provider transmission, and replay policy may differ from durable run data.

### Activity and audit

- Devtools Activity currently records a `model.command` exchange and its canonical request/result.
  Interactive runs need correlated lifecycle entries without leaking sensitive response values.
- Progress, Interaction requests, replies, executor traces, and actual graph effects need distinct
  event kinds and retention policies.

## Recommendation For The Next Smallest Experiment

Implement one **code-backed, durable Todo Operation** with two typed Interactions and no LLM:

1. read duplicate candidate lists;
2. request a choice between stable list Refs;
3. read the selected list's current items;
4. request approval of exact deletion requests;
5. resume, revalidate, and execute one bounded command or a deliberately specified sequence;
6. return the Operation's normal typed result.

Run it through two surfaces: a minimal React projection and a CLI/Devtools projection. Both must
observe the same run and submit the same typed reply protocol. Use an in-memory explicit state
machine/store first; do not attempt transparent arbitrary-async suspension. The experiment should
cover invalid, duplicate, expired, stale, unauthorized, and concurrent replies.

Then implement the same state machine behind a tiny local LangGraph.js adapter. Do not include an
LLM in either variant. Compare:

- public Ontahí contracts required by both;
- persisted records and identities;
- code replay and side-effect boundaries;
- amount of adapter-specific plumbing;
- whether the native design accidentally depends on LangGraph terminology;
- whether a LangGraph checkpoint can remain opaque while Ontahí Interaction and run records remain
  complete and inspectable.

This experiment falsifies the proposal if the two runtimes require materially different public
Interaction or run semantics. If they share the same protocol and surface projections, it provides
strong evidence that Model Support can later consume the primitive without owning it.

## Native Runtime Slice In Progress

The first implementation slice establishes the smallest transportable choice Interaction before
building the complete Todo experiment:

1. a durable Operation requests a typed choice through its existing Task Context;
2. the public snapshot exposes only the Interaction ID, prompt, and stable option IDs and labels;
3. the in-process runtime retains the option values and returns the selected typed value to the
   Operation after one matching response;
4. inspection and response use the existing `durable.operation` Runtime Protocol family;
5. invalid, mismatched, and duplicate responses fail without resuming the run.

The slice keeps the run status as `running`; the presence of `snapshot.interaction` is the explicit
waiting signal. This avoids adding a second source of lifecycle truth before the comparison shows
whether waiting should become a status in persistent runtimes.

This native adapter deliberately proves the semantic boundary before persistence. Its continuation
is process-local and is lost if the process exits. It therefore does not yet satisfy restart-safe
durability and must not be used as evidence that an arbitrary JavaScript stack can be checkpointed.
The Vercel Workflow adapter reports Interaction as unavailable until it has corresponding durable
wait/resume semantics.

## Acceptance And Research Closure

- [x] Inventory the current Operation, Runtime Protocol, durable lifecycle, identity, Activity, and
      Model Support boundaries from current code and merged work.
- [x] Compare LangGraph graph/state, checkpoint, thread, interrupt/resume, Command, streaming,
      memory/store, subgraph, and retry concepts with Ontahí.
- [x] Distinguish existing canonical requests, the missing Interaction primitive, lifecycle
      observation, and suspension mechanics instead of inventing a duplicate effect language.
- [x] Separate Principal, Participant, transport session, interaction session, invocation, run,
      Interaction, continuation handle, and model state.
- [x] Describe one code-backed and one LLM-backed execution using the same Ontahí semantics.
- [x] Identify what an optional LangGraph adapter would and would not own.
- [x] Recommend one bounded comparison experiment before public API design.
- [ ] Execute the native versus LangGraph comparison and record implementation evidence.
- [ ] Complete the two-Interaction Todo Operation and expose it through two surfaces.
- [ ] Implement restart-safe native state-machine persistence for the comparison experiment.
- [ ] Decide whether interactive execution extends Durable Operation/Task Run or introduces a more
      general execution-run lifecycle from which durable tasks are projected.
- [ ] Decide the first Interaction storage/protocol contract only after the experiment.

The research remains open until the comparison experiment resolves the lifecycle boundary. It
already rejects two directions: making `model.command` the universal conversation protocol, and
making LangGraph threads/nodes/Commands part of Ontahí's public semantic model.

## Sources

Primary LangGraph sources consulted:

1. [LangGraph.js repository and standalone positioning](https://github.com/langchain-ai/langgraphjs)
2. [LangGraph.js MIT license](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE)
3. [Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
4. [Graph API and Command](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
5. [Functional API, tasks, replay, and determinism](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/functional_api.md)
6. [Persistence, threads, checkpoints, pending writes, and Store](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md)
7. [Fault tolerance, retries, timeouts, and graceful drain](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/fault-tolerance.mdx)
8. [Streaming](https://docs.langchain.com/oss/javascript/langgraph/streaming)
9. [Subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)
10. [Memory](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/memory.md)
11. [Workflows, agents, tool loops, and ToolNode](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
