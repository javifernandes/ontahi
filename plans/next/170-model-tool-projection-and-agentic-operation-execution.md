# 170. Model Tool Projection And Agentic Operation Execution

Status: next

Canonical ID: `ontahi://plans/170-model-tool-projection-and-agentic-operation-execution`

Shapes: [Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md),
[Domain Operation](../../atlas/items/model/domain-operation.md),
[Operation Invocation](../../atlas/items/model/operation-invocation.md), and
[Operation Interaction](../../atlas/items/model/operation-interaction.md).

Related plans:

1. [125. Ontahi AI Operations](../research/125-ontahi-ai-operations.md)
2. [125a. Model Execution Resource Governance](../current/125a-model-execution-resource-governance.md)
3. [144. Executable Ontologies](../backlog/144-executable-ontologies.md)
4. [153a. Model Execution Security And Authorization](../backlog/153a-model-execution-security-and-authorization.md)
5. [153b. Declarative Operation Context Scope](../backlog/153b-declarative-operation-context-scope.md)
6. [153c. Operation Interactions And Resumption](../done/153c-operation-interactions-and-resumption.md)
7. [156. Model-Backed Domain Operation Executor](../done/156-model-backed-domain-operation-executor.md)
8. [158. Semantic Execution Context, Governance, And Evidence](../research/158-semantic-execution-context-governance-and-evidence.md)
9. [162. Operation Execution Resilience](../done/162-operation-execution-resilience.md)
10. [163. Operation Implementation Bindings And Variants](../current/163-operation-implementation-bindings-and-variants.md)
11. [`Atlas 141. Read-Only Plan Assistant`](atlas://plans/141-read-only-plan-assistant)

## Summary

Let a model-backed Domain Operation request a bounded sequence of already-declared Ontahi
capabilities while producing its typed result. Project authorized Graph Reads, Graph Commands,
Operation Invocations, and Interactions into provider-facing model tools without making OpenAI,
Anthropic, DeepSeek, LangGraph, or another agent SDK a second application language.

The first proof remains read-only and immediate. An Atlas Workspace assistant should be able to
search semantic Items, read one Item, follow its relations, and inspect authorized source content
before answering. It should do so through explicit Ontahi capabilities, with a small turn and
resource budget, complete nested invocation evidence, and no shell, repository checkout, ambient
database access, mutation authority, or durable conversation memory.

This is **semantic-model-first**, not foundation-model-first. Operations do not become model tools;
a model tool is one temporary adapter projection of an existing semantic capability. The same
Operation contract may also project as a React affordance, CLI command, Devtools control, Runtime
Protocol request, or remote invocation.

## Context

Ontahi already proves the surrounding pieces:

1. `modelOperation(...)` executes one selected typed Operation with host-assembled context and a
   provider-neutral structured result.
2. Intent Resolution converts fuzzy input into canonical Reads, Commands, and Operation
   Invocations before ordinary authorization and dispatch.
3. Runtime Protocol discovery and reflection describe canonical application capabilities.
4. Resource Governance admits attempts, limits model output, attributes usage, and controls
   evidence disclosure.
5. Durable Operations and Operation Interactions represent progress, waiting, participant replies,
   and resumable execution independently from model providers.
6. The LangGraph comparison identifies an agent/tool loop as an executor-internal decision
   mechanism and recommends projecting Ontahi capabilities rather than adopting a parallel tool
   vocabulary.

The missing slice is dynamic capability use _inside_ model-backed Operation execution. Today a
host must guess the relevant context before the model call. That is adequate for a narrow
suggestion but fails when answering requires several dependent discoveries: search for a concept,
read its definition, follow its relationships, inspect a related Plan, then synthesize a result.

Atlas supplies direct consumer evidence. `AtlasWorkspace.askPlans` performs deterministic lexical
retrieval over Plan title, path, and Markdown, bounds the selected documents, and makes one model
call. A user can see a `Durable Operation` Concept in Atlas while the assistant reports that no
definition exists because the model received only indirectly related Plans. The semantic graph
already contains better evidence; the executor cannot yet ask for it.

Without one framework contract, each application will create its own provider tool schemas, loop,
dispatch shortcuts, authority propagation, usage aggregation, error rules, and traces. That would
reproduce the application-local AI overlay that Model-Backed Operation Execution exists to avoid.

## Core Distinctions

1. **Semantic capability** is a canonical Graph Read, Graph Command, Domain Operation, or
   Interaction with Ontahi identity and contracts.
2. **Tool grant** is the bounded authority for one model executor to request a particular projected
   capability under additional narrowing policy.
3. **Provider tool** is an adapter-private name, JSON schema, call ID, and message envelope.
4. **Tool request** is untrusted model output until parsed, validated, authorized, and translated
   into a canonical Ontahi request.
5. **Nested invocation** is the actual runtime execution of that canonical request with inherited
   causal context and newly checked authority.
6. **Agent loop** alternates model inference and actual tool results until the model returns the
   parent Operation output or a bounded failure occurs.
7. **Conversation** is a participant-facing interaction history and identity. It is not implied by
   executor-private provider messages.
8. **Working state** is private execution state for the loop. It is not authoritative Entity state
   and does not become durable merely because messages accumulate.

## Scope

1. Define a provider-neutral model exchange contract that can return either a validated final
   output candidate or one or more structured tool-call candidates.
2. Define how a model-backed Operation explicitly grants a narrow set of canonical capabilities.
3. Project granted capability names, descriptions, and input schemas into provider tool schemas
   without exposing provider vocabulary in reflected Domain Operation contracts.
4. Translate each provider tool call into an existing canonical Graph Read, Graph Command,
   Operation Invocation, or Interaction request rather than introducing a universal parallel
   effect AST.
5. Revalidate input, Principal authority, receiver, contextual scope, and host policy before every
   nested execution. A parent Operation grant may narrow but never widen ordinary authority.
6. Return the actual canonical result or failure to the model through an explicit bounded
   projection that avoids leaking secrets or unrestricted runtime state.
7. Preserve parent invocation, nested invocation, attempt, tool-call, and Resource usage identity
   in execution evidence.
8. Define termination limits for turns, tool calls, nested depth, tokens, time, cancellation, and
   repeated equivalent requests.
9. Define deterministic behavior for malformed calls, denied capabilities, canonical failures,
   provider failures, and invalid final output.
10. Prove the smallest read-only immediate loop in Ontahi and exercise it from Atlas through its
    repository-owned consumer plan.
11. Keep provider-specific tool support in adapters and allow an adapter to report honestly that it
    cannot satisfy an agentic model binding.

## Non-Goals

1. Do not add shell, filesystem, Git checkout, arbitrary HTTP, raw SQL, or ambient database access.
2. Do not create a general autonomous-agent platform or remote coding-agent service.
3. Do not introduce mutation tools, approval, or participant Interaction into the first proof.
4. Do not add durable conversation memory, semantic memory, embeddings, or vector storage.
5. Do not make every reflected Operation automatically available to a model.
6. Do not let provider tool names, call IDs, message history, or SDK types enter canonical Runtime
   Protocol contracts.
7. Do not treat schema validation, prompt instructions, or a parent tool grant as authorization.
8. Do not require LangGraph. Its loop and checkpoint mechanisms remain an optional executor/runtime
   implementation technique.
9. Do not make nested model-generated invocations silently retryable; resilience policy remains
   explicit and each nondeterministic attempt remains attributable.
10. Do not claim that an immediate read-only proof settles durable agents, effects, approval,
    replay, or private workspace lifecycle.

## Proposed Form

The eventual declaration should make the granted semantic capabilities visible beside the model
implementation while leaving exact public syntax to the proof:

```ts
askAtlas: operation({
  receiver: { kind: 'input', path: 'workspace' },
  input: AskAtlasInput,
  output: AskAtlasAnswer,
  implementations: {
    model: modelOperation({
      instructions: askAtlasInstructions,
      tools: input => [
        operationTool(AtlasWorkspace.searchItems, {
          receiver: input.workspace,
        }),
        operationTool(AtlasItem.read, {
          scope: { workspace: input.workspace },
        }),
        operationTool(AtlasItem.listRelations, {
          scope: { workspace: input.workspace },
        }),
        operationTool(AtlasItem.readSource, {
          scope: { workspace: input.workspace },
        }),
      ],
      execution: {
        maxTurns: 6,
        maxToolCalls: 8,
        maxNestedDepth: 1,
      },
    }),
  },
  dispatch: operationBinding('atlas.assistant'),
});
```

This spelling is illustrative. The proof must decide whether Graph Reads need application-owned
wrapper Operations or can be projected safely as narrowed canonical requests. It must not invent
fake Operation identity merely to satisfy an SDK that calls everything a tool.

### Canonical execution loop

```text
parent Operation Invocation
  -> authorize parent receiver and input
  -> resolve model provider, Resource policy, and tool grants
  -> project grants into adapter-private tool descriptions
  -> model exchange
       -> final output candidate
            -> validate parent output contract and semantic guard
            -> return canonical parent result
       -> provider tool-call candidate
            -> map to one granted canonical capability
            -> validate tool arguments
            -> reauthorize receiver, Principal, scope, and host policy
            -> dispatch nested canonical request
            -> project actual result or canonical failure
            -> append private exchange state and continue
  -> stop on result, cancellation, denial, exhaustion, or failure
```

### Provider boundary

The existing provider abstraction currently models one structured generation. Agentic execution
needs a narrower extension or sibling contract that can express:

```ts
type ModelExchangeOutcome<Output> =
  | { kind: 'output'; value: Output }
  | { kind: 'tool-calls'; calls: ModelToolCall[] };
```

Core owns semantic tool descriptors, canonical dispatch, loop policy, and evidence. Provider
adapters own conversion to and from OpenAI, Anthropic, DeepSeek, Ollama, or other wire formats.
Adapters must preserve opaque provider call correlation only as private or diagnostic evidence.

The proof should begin sequentially even if a provider emits several calls. Parallel reads may be
added only after ordering, cancellation, result correlation, and Resource evidence are explicit.

### Authority and scope

A grant means “the executor may request this capability”; it does not mean “the request will
succeed.” Every requested call passes through ordinary validation and authority again.

The effective permission is the intersection of:

1. parent Operation declaration;
2. selected implementation binding;
3. host/runtime policy;
4. admitted Principal and receiver authority;
5. invocation-local contextual scope;
6. nested capability's own authorization and preconditions.

Refs returned by one tool may be used by later calls only within the same admitted execution scope.
The model cannot invent a Ref outside disclosed results and gain access merely because it satisfies
a JSON schema.

### Evidence and governance

One parent invocation may contain several model attempts and nested semantic invocations. Evidence
must preserve rather than flatten those identities:

```text
Operation Invocation
  -> model attempt 1
      -> tool call A
          -> nested Graph Read
      -> tool call B
          -> nested Operation Invocation
      -> model attempt 2
          -> final typed output
```

Resource limits apply to the whole admitted parent execution and may also narrow individual model
attempts. Tool-count and nested-depth exhaustion are canonical executor failures, not fabricated
business output. Disclosure policy decides whether a client sees only a summary, trusted debug
details, or no executor evidence.

## First Vertical Proof

Use Atlas as consumer evidence without importing Atlas nouns into Core. Evolve the read-only
Workspace assistant from host-guessed Plan fragments toward an agentic semantic query:

```text
question: "What is a Durable Operation?"
  -> search Items for "Durable Operation"
  -> read the matching Concept
  -> list its related Plans and artifacts
  -> read only the additional authorized evidence needed
  -> return a typed answer with citations to actual Atlas Items
```

The Atlas repository owns its Operations, UI, citation model, Workspace authorization, retrieval
quality, and migration from `askPlans` toward a broader `askAtlas` experience. Ontahi owns the
provider-neutral exchange, semantic tool projection, dispatch, budgets, and trace contract.

The proof should use at least two real provider adapters if their APIs support tool calling, plus a
deterministic fake that exercises multi-turn behavior and failure paths. Provider parity may be
staged, but unsupported adapters must fail during composition or binding validation rather than at
an arbitrary mid-run point.

## Provider And Contract Inventory — 2026-11-19

The current Core `ModelProvider` deliberately represents one structured generation:

```ts
type ModelProvider = {
  generate(request: ModelRequest): Promise<unknown>;
};
```

`ModelRequest` contains instructions, bounded context, one prompt, the final output schema,
cancellation, the governed output ceiling, and a usage callback. OpenAI and DeepSeek implement it
through their Responses endpoints, Anthropic through Messages structured output, and Ollama
through structured chat. `createModelOperationExecutor(...)` treats the returned value as the final
candidate and immediately validates the parent Operation output contract. There is no provider
conversation, tool descriptor, intermediate outcome, or continuation state.

Official provider contracts confirm a shared conceptual loop but materially different continuation
formats:

| Provider  | Tool request                                              | Continuation requirement                                                                                                                    |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI    | Responses function-call output items                      | Continue with function-call results through Responses input items and provider response/conversation correlation.                           |
| Anthropic | Messages `tool_use` blocks with `stop_reason: "tool_use"` | Return `tool_result` blocks associated with the original tool-use IDs; assistant content blocks remain part of the message exchange.        |
| DeepSeek  | Responses or Chat Completion function calls               | Return correlated tool results; thinking mode may require preserving and returning provider `reasoning_content` across subsequent requests. |
| Ollama    | Chat response `message.tool_calls`                        | Append the assistant tool-call message and tool result messages before the next chat request.                                               |

Sources:

1. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
2. [Anthropic tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
3. [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/)
4. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)

All four can project function-like tools from JSON Schema and can return several calls. None of
them executes application tools for the caller. The application remains responsible for argument
validation, execution, result correlation, and continuation. Provider-side strict schema modes
improve syntax but do not replace Ontahi validation or authority.

### Contract decision

Do not widen `ModelProvider.generate(...)` into a union of final values, provider messages, and tool
calls. Existing Intent Resolution and model-backed Operations need one structured value and should
not inherit session semantics, optional branches, or adapter history merely because another
executor is agentic.

Introduce a sibling immediate-exchange capability. Its precise exported names remain implementation
work, but the minimum shape is:

```ts
type ModelExchangeProvider = {
  open(request: ModelExchangeRequest): ModelExchangeSession;
};

type ModelExchangeSession = {
  next(results?: readonly ModelToolResult[]): Promise<ModelExchangeOutcome>;
};

type ModelExchangeOutcome =
  | { kind: 'output'; value: unknown }
  | { kind: 'tool-calls'; calls: readonly ModelToolCall[] };
```

The session is adapter-owned, executor-private, immediate working state. It may retain a response
ID, provider content blocks, reasoning content, or a message array without exposing those details
to Core. `ModelToolCall` carries only the projected tool name, untrusted arguments, and the opaque
correlation needed to return its result. The runtime creates its own semantic tool-attempt and
nested-invocation identities; a provider call ID is never reused as canonical evidence identity.

The exchange request retains the same instructions, context, prompt, output schema, cancellation,
usage reporting, and governed generation ceiling as `ModelRequest`, and adds semantic tool
descriptors. A descriptor contains a stable executor-local name, description, and Graph JSON input
schema. It does not contain a callable function, provider SDK object, authority token, or ambient
runtime capability.

Tool results distinguish a successful bounded JSON projection from a canonical denied or failed
result. The executor decides which failures may be shown to the model for recovery. Cancellation,
provider transport failure, malformed provider envelopes, and exhausted runtime policy terminate
through existing or explicitly extended model-execution failure vocabulary; they are not ordinary
tool results by default.

This session contract intentionally does not claim durability. A Durable Operation cannot persist a
live adapter object. Later durable agent work must define checkpointable semantic exchange state or
let a runtime adapter reconstruct provider-private state from an execution journal. That question
must not inflate the first immediate read-only proof.

### Adapter capability and compatibility

Provider factories may return an object satisfying both `ModelProvider` and
`ModelExchangeProvider`, while custom providers can implement only the capability they support.
Existing `generate` callers remain source compatible. An agentic model binding requires the
exchange capability during application composition or binding resolution and fails clearly before
opening an execution when it is absent.

The first implementation should add the contract and a deterministic fake before changing a remote
adapter. OpenAI is the preferred first real proof because the existing adapter already uses the
Responses API. Anthropic is the preferred second proof because its content-block continuation is
structurally different and tests whether the abstraction is genuinely provider-neutral. DeepSeek
and Ollama follow through the adapter capability matrix rather than being simulated as OpenAI
aliases.

## Execution Slices

### Slice 1 — contract and adapter inventory

- [x] Inventory tool-call and multi-turn support in current OpenAI, Anthropic, DeepSeek, and Ollama
      adapters using official provider contracts.
- [x] Separate semantic tool descriptors from provider schemas, messages, and call IDs.
- [x] Decide whether the existing `ModelProvider` evolves compatibly or an agentic exchange
      capability composes beside it.
- [x] Specify final-output, tool-call, denial, exhaustion, cancellation, and provider-failure
      outcomes.

### Slice 2 — bounded read-only loop

- [ ] Add a deterministic fake provider that requests at least two dependent tools before returning
      a valid parent output.
- [ ] Project an explicitly granted read-only Operation or Graph Read into a model tool.
- [ ] Validate and dispatch each request through the canonical runtime with inherited causal
      context and renewed authority.
- [ ] Enforce maximum turns, tool calls, nested depth, and repeated-call protection.
- [ ] Validate the final result through the existing parent Operation output contract and semantic
      guard.

### Slice 3 — evidence and provider proof

- [ ] Capture parent/model-attempt/tool-call/nested-invocation relationships without placing them in
      business output.
- [ ] Aggregate Resource admission and usage without hiding unmeasured or failed attempts.
- [ ] Expose bounded debug evidence in Devtools under existing disclosure policy.
- [ ] Prove at least one real provider's native tool-call exchange and record unsupported adapter
      behavior honestly.

### Slice 4 — Atlas consumer evidence

- [ ] Define read-only Atlas semantic search/read/relation/source capabilities.
- [ ] Bind only those capabilities to the Workspace assistant under Workspace authorization.
- [ ] Answer a question that deterministic Plan-only retrieval currently misses.
- [ ] Verify citations against the Items and source records actually returned by nested calls.
- [ ] Compare answer quality, latency, token usage, and tool trace with the current bounded
      `askPlans` implementation.

### Slice 5 — recommendation

- [ ] Decide whether immediate loops are sufficient for bounded read-only synthesis.
- [ ] Extract durable agent execution, participant Interaction, conversation memory, mutation and
      approval, and sandboxed repository work into separate linked plans as evidence requires.
- [ ] Document the supported projection surface and adapter capability matrix.

## Acceptance Checklist

- [ ] One model-backed Operation can request at least two dependent semantic capabilities before
      returning its ordinary typed result.
- [ ] Only explicitly granted capabilities are projected; reflected application discovery alone
      grants nothing.
- [ ] Every tool call becomes an authorized canonical request and uses the ordinary dispatcher.
- [ ] Provider-native tool envelopes do not become a second Ontahi operation language.
- [ ] Parent and nested invocation identity, Principal, receiver, Resource attempts, and results are
      traceable.
- [ ] Turn, tool-call, depth, token, duration, and cancellation limits terminate execution
      honestly.
- [ ] Invalid, denied, repeated, or exhausted calls cannot be converted into successful effects by
      model narration.
- [ ] The final answer satisfies the parent Operation output schema and application semantic guard.
- [ ] An unsupported provider binding fails clearly before useful work begins.
- [ ] Atlas demonstrates a materially better grounded answer without shell, checkout, raw DB
      access, mutation tools, or durable conversation memory.

## Verification

1. Unit tests for semantic descriptor projection, adapter translation, and provider response
   parsing.
2. Contract tests for final output, sequential tool calls, multiple calls, malformed arguments,
   denied calls, unknown tools, repeated calls, exhaustion, cancellation, and provider failure.
3. Runtime tests proving ordinary validation, authority, receiver binding, nested invocation, and
   causal context for every call.
4. Resource evidence tests proving distinct admitted attempts and honest incomplete measurement.
5. Devtools tests for disclosure-controlled parent and nested activity.
6. Real-provider smoke tests kept opt-in and secret-safe.
7. Atlas-owned integration tests and a quality fixture contrasting Plan-only retrieval with semantic
   tool use.

## Decisions

1. Ontahi's semantic model is primary; provider tools are replaceable projections.
2. The first proof is one immediate, read-only, bounded loop.
3. Existing Graph Reads, Graph Commands, Operation Invocations, and Interactions remain the
   canonical capability language; no universal model-only action AST is introduced.
4. A tool grant narrows availability but never establishes authority for a concrete request.
5. Provider messages and executor scratch state are private runtime state, not domain Entities or
   user Conversation history.
6. LangGraph may implement the loop later but does not define its public semantics.
7. Atlas is consumer evidence, not the source of framework vocabulary.
8. Shell and repository agents are a later execution resource with a materially different security
   and lifecycle boundary.

## Open Questions

1. Should tool grants be declared directly by a model implementation, supplied through a named
   Capability set, or intersect both sources?
2. Can a narrowed canonical Graph Read project directly, or should every model-visible action be a
   named application Operation for description, audit, and evolution?
3. How should tool result projections limit size, sensitive Fields, and recursive relationships?
4. Should several read-only calls emitted in one model turn run sequentially or through an explicit
   parallel-read policy?
5. Which failures return to the model for possible recovery, and which terminate immediately?
6. How should equivalent/repeated call detection work without rejecting legitimate pagination or
   polling?
7. Does each model continuation consume a new Resource attempt, and how does a provider report
   usage accumulated across tool messages?
8. When does an immediate loop need promotion to a Durable Operation with checkpointed private
   state?
9. How does a later user Conversation relate to provider message state without collapsing
   Conversation ID, Task Run ID, model thread ID, and client-session identity?
10. What additional policy is required before exposing Commands or effectful Operations as tools?

## Closure / Evolution

This plan closes when Ontahi proves one bounded model executor that dynamically uses authorized
semantic capabilities and returns the unchanged parent Operation result, with provider-neutral
contracts, honest limits, and traceable nested execution. Atlas must demonstrate that the mechanism
answers one real semantic question that the current host-guessed context misses.

Durable agents, participant Interaction, conversation memory, effectful tools and approval, and
sandboxed repository work remain explicit follow-ups. They should reuse this capability projection
rather than introducing a separate agent action language.
