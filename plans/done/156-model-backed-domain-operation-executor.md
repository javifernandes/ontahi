# 156. Model-Backed Domain Operation Executor

Status: done

Canonical ID: `ontahi://plans/156-model-backed-domain-operation-executor`

Shapes:
[Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md).

Related plans:

1. [125. Ontahi AI Operations](../research/125-ontahi-ai-operations.md)
2. [125a. Model Execution Resource Governance](../backlog/125a-model-execution-resource-governance.md)
3. [153. Model-Backed Todo Command Spike](../done/153-model-backed-todo-command-spike.md)
4. [153a. Model Execution Security And Authorization](../backlog/153a-model-execution-security-and-authorization.md)
5. [153b. Declarative Operation Context Scope](../backlog/153b-declarative-operation-context-scope.md)

## Summary

Prove model-backed execution as an implementation mode of an already selected Domain Operation.
The first operation, `TodoList.suggestNextItem`, receives a Todo List Ref, reads a bounded authorized
projection of that list and its current items, and returns one typed suggestion without mutating
application state. Runtime composition can bind either a model-backed or code-backed executor while
the operation identity, input, output, canonical invocation, and caller remain unchanged.

This is distinct from Plan 153. Intent Resolution used a model to select or complete a canonical
request from natural language. This Plan begins after selection: the caller has already invoked
`TodoList.suggestNextItem`, and a model computes that Operation's ordinary result.

The proof establishes the minimum executor boundary before resource governance, declarative context
scope, simultaneous implementation variants, or effectful model-backed Operations are designed.

## Concrete Example

The public semantic contract is independent of its implementation:

```ts
TodoList.suggestNextItem({ list })
  -> { title: string, reason?: string }
```

The model-backed binding receives:

```text
operation identity and description
+ normalized typed input
+ output schema
+ authorized context selected by host code
+ cancellation and invocation context
-> ordinary typed Operation result
```

For the Todo proof, context is deliberately explicit and small:

```ts
{
  list: { id, name },
  items: [{ id, title, completed }],
}
```

The model may infer a missing or useful next item, but it cannot read outside that projection or
persist the suggestion. The Runtime validates provider output against the Operation's existing
output contract before returning success.

A code-backed binding should produce the same result type through a small deterministic heuristic
or template vocabulary. It need not reproduce the model's wording or quality. It proves that
callers depend on the semantic Operation rather than the implementation technology.

## Architectural Questions To Resolve

1. Where does executor binding belong so an application can replace implementation without
   redefining the Domain Operation: declaration resolution, application composition, or a narrower
   runtime capability?
2. What is the smallest provider-neutral executor request that can reuse the existing
   `ModelProvider` without turning its prompt/context envelope into public Operation semantics?
3. Which Operation metadata is safe and useful to pass to an executor, and which configuration
   remains private to the host binding?
4. How does a context assembler run authorized Graph Reads with the caller's invocation context
   without granting the provider direct graph access?
5. Where should invalid model output become the existing validation or runtime failure vocabulary?
6. Can replacement select exactly one binding per composed application without introducing feature
   flags, routing, fallback, or simultaneous variants?

Answer these from the smallest vertical implementation. Do not freeze a general executor registry
or public builder before the Todo proof exposes the necessary seam.

## Scope

1. Inventory the current Domain Operation resolver/runner, Operation contracts, runtime
   capabilities, `ModelProvider`, cancellation, and telemetry seams.
2. Declare one read-only `TodoList.suggestNextItem` Operation with a graph-native input and output
   schema and ordinary canonical invocation behavior.
3. Bind a model-backed executor without embedding provider-specific configuration in the Domain
   Operation contract.
4. Assemble context in code from an authorized bounded read of the selected list and its items.
5. Pass the Operation output schema to the provider and validate the returned value before it can
   become an Operation success.
6. Bind a code-backed replacement without changing the public Operation or its callers.
7. Exercise the model-backed path with a real local provider and deterministic provider doubles.
8. Add the smallest Todo UI autocomplete affordance only after the runtime proof is complete. The UI
   may place the suggestion into an editable item draft; acceptance uses the existing creation path.
9. Record the resulting executor, context, validation, and package boundaries in Research 125 and
   the Atlas.

## Non-Goals

1. Do not persist a suggested item automatically.
2. Do not let the provider execute Graph Reads, Graph Commands, Operations, or arbitrary tools.
3. Do not infer a general declarative context language; Plan 153b owns that work.
4. Do not add budgets, quotas, accounting, or provider usage policy; Plan 125a follows this proof.
5. Do not claim production prompt-injection or tenant-isolation readiness; Plan 153a owns that
   hardening.
6. Do not require model-backed and code-backed implementations to coexist in one application.
7. Do not add feature flags, rollout, shadow evaluation, fallback routing, or implementation
   priority rules.
8. Do not make this first Operation durable, streamed, effectful, or interactive.
9. Do not create a generic agent or tool-loop abstraction.

## Execution Slices

### Slice 1: Contract inventory and test seam

1. Trace an invoked Domain Operation from resolved declaration through normalization, requirements,
   conditions, concerns, execution, output handling, and invocation result.
2. Identify the narrowest composition point where `run` can be supplied by an executor binding
   without duplicating the Operation declaration.
3. Characterize existing `ModelProvider` request, failure, cancellation, and structured-output
   behavior with tests before expanding it.
4. Record which executor inputs already exist and which must be introduced.

### Slice 2: Typed executor proof

1. Add the minimal internal executor-binding model demonstrated by the inventory.
2. Declare `TodoList.suggestNextItem` once with a Todo List Ref input and structured suggestion
   output.
3. Use a deterministic provider double to prove input, context, output-schema projection, output
   validation, cancellation, and honest provider failure.
4. Verify that invalid provider output cannot become a successful Operation result.

### Slice 3: Context and replaceability

1. Read only the selected list identity/name and bounded item identity/title/completion state under
   the caller's existing authority.
2. Reject missing, denied, or truncated context honestly rather than asking the model to guess.
3. Add a code-backed executor for the same Operation and select it through composition.
4. Invoke both configurations through the same canonical client/runtime surface and compare their
   contract-level behavior, not their exact prose.

### Slice 4: Real model and thin experience

1. Exercise the model binding against the existing local Ollama provider with disposable Todo data.
2. Record a small evaluation set: empty list, obvious missing step, duplicate suggestion pressure,
   completed items, and provider failure.
3. If runtime evidence is sound, expose a tentative editable autocomplete suggestion in Todo. The
   suggestion remains a value until the user chooses the existing item-creation action.
4. Update Research 125 and Atlas with evidence, limitations, and the chosen package/composition
   boundary.

## Acceptance And Verification

- [x] `TodoList.suggestNextItem` is one Domain Operation declaration with one stable identity,
      input schema, output schema, invocation, and caller.
- [x] Model-backed and code-backed application compositions can each implement that Operation
      without changing the declaration or caller.
- [x] The model executor receives normalized input, the exact expected output schema, bounded
      authorized context, cancellation, and no undeclared graph/tool access.
- [x] Provider output is parsed and validated before becoming the ordinary Operation result.
- [x] Missing or denied context, invalid output, provider failure, timeout, and cancellation are
      represented honestly and produce no mutation.
- [x] The model-backed invocation passes through existing requirements, conditions, concerns,
      telemetry, and canonical result handling rather than a parallel AI dispatch path.
- [x] Context contains only the selected list and its bounded projected items; limits are explicit
      and tested.
- [x] A real local-model evaluation is recorded without treating sample success as a reliability or
      security proof.
- [x] Any UI suggestion is editable and tentative; accepting it uses the existing authoritative
      creation path.
- [x] A package/public-API decision and deferred work are recorded from implementation evidence.

## Effectful Follow-Up: `TodoList.createFromGoal`

The next proof should exercise the third leg of an Operation contract: effects and observable
pre/postconditions, not only typed input/output and context.

```ts
TodoList.createFromGoal({
  name: 'Asado del domingo',
  goal: 'Organizar un asado para ocho personas',
}) -> { list: TodoList.ref, items: TodoItem.ref.many() }
```

Its implementation may use a model executor to produce a validated `ChecklistDraft`, but the model
must not claim or directly perform the authoritative mutation. Ontahi-owned execution should:

1. check caller authority and Operation preconditions;
2. obtain and validate the typed draft;
3. execute canonical list/item Commands, preferably within the strongest available atomic boundary;
4. evaluate postconditions against the resulting application state; and
5. return actual created Refs or a canonical failure.

Candidate observable postconditions include: exactly one new caller-owned list exists, every
created item belongs to that list, item count stays within the declared bound, and every persisted
value satisfies its Entity schema. A model response is evidence for the proposed content, never
evidence that these postconditions hold.

Do not implement this effectful example inside the minimum `suggestNextItem` executor proof. Once
the first executor boundary is evidenced, either activate it as a separately reviewable slice or
extract a linked follow-up Plan if atomicity, compensation, or portable postconditions require
their own design.

## Decisions

1. The first model-backed Domain Operation is contextual but read-only and non-authoritative.
2. Context is host-assembled through authorized graph reads; it is data supplied to the executor,
   not provider authority.
3. The Operation output contract, not provider structured-output syntax, defines success.
4. The code replacement proves substitution at composition time; simultaneous variants are not
   required.
5. UI autocomplete is a projection of a tentative Operation result, not an implicit Command.
6. Effectful model-backed execution composes model computation with Ontahi-owned authoritative
   effects and condition checking; it does not delegate authority to the model.

## Closure And Evolution

Close this Plan when the contextual read-only Operation runs through model-backed and code-backed
application compositions without changing its semantic contract or caller, and the implementation
evidence supports a precise executor boundary. Then activate Resource Governance Plan 125a against
both this path and existing Intent Resolution.

The `createFromGoal` effectful proof follows rather than blocking closure. It must preserve the
separation between generated content, authorized mutation, and verified application facts.

## Closure Evidence — 2026-10-22

PR #255 implemented the provider-neutral Core executor and the contextual
`TodoList.suggestNextItem` proof. The Operation owns instructions, bounded context assembly, and
semantic validation through `modelOperation`; application composition supplies either a model
provider or the deterministic code implementation without changing the public declaration or
caller. Todo exposes the result as an editable draft and persists nothing until the existing create
Command is invoked.

The proof exercised a real local Ollama model and deterministic provider doubles. Core owns generic
provider execution, cancellation, typed failures, and output validation. Provider adapters remain
replaceable server infrastructure; Todo owns provider selection and credentials. Resource usage,
budgets, attribution, and audit now proceed in Plan 125a against both this executor and Intent
Resolution. Effectful generation, declarative context scope, rollout variants, and feature flags
remain explicit follow-ups rather than requirements for this closed slice.
