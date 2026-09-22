# 153. Model-Backed Todo Command Spike

Status: current

Canonical ID: `ontahi://plans/153-model-backed-todo-command-spike`

Shapes: [Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md),
[Intent Resolution](../../atlas/items/model/intent-resolution.md).

## Summary And Context

Prove a small chat-style Todo experience: “add item buy bread” creates an item in the current
list; “complete buy tea” completes an unambiguously identified item. A typed operation uses an
LLM to resolve text into a proposed invocation; the existing dispatcher executes the proposal.
This is a bounded spike alongside first-version consolidation, not a prerequisite for release or
an autonomous-agent platform. Atlas is the later application pressure test: first questions about
plans, then reviewed plan modifications. Atlas product implementation remains outside this plan.

[Research 125](../research/125-ontahi-ai-operations.md) separates intent resolution from executor
selection. This spike supplies its narrow effectful experiment: interpretation is non-authoritative,
while an explicitly enabled local Todo path applies one permitted operation under the caller's
existing authority. It does not claim production security readiness.

## Scope And Proposed Form

Illustrative names below are design placeholders, not a frozen public API:

```text
interpretCommand({ text, currentList })
  -> resolved { invocation: existing Operation Invocation }
  |  unresolved { reason }

resolved proposal -> runtime validation -> canonical dispatcher -> actual result -> UI
```

1. Expose interpretation as an ordinary typed operation with a model-backed implementation.
2. Build context in code from inputs, current-list identity, and authorized graph reads. Include
   relevant item identities, titles, completion state, and reflected allowed-operation contracts.
3. Limit the effect path to existing TodoList.createList, TodoItem.createItem, and
   TodoItem.setCompleted, with at most one invocation per submission. The current list is nullable:
   creation of a list is global, while item commands require a selected list. Verify their actual input schemas during implementation.
4. Require concrete references for existing targets. Names alone require instance resolution;
   missing, ambiguous, or incomplete context returns unresolved without effects.
5. Define a small injectable model-provider boundary and implement an initial local Ollama adapter.
   Keep context assembly, canonical invocation semantics, and dispatch outside the provider.
6. Validate structured output against the interpretation result contract and the selected operation
   input contract; enforce allowed operation and current-list scope in runtime code, not just prompts.
7. Execute with the authenticated caller's authority. The LLM cannot supply or replace that authority.
8. Show submission, pending, unresolved, executed, and failed states in a chat-style Todo surface.
   Success text comes from the actual execution result. No conversation memory is required.

The incoming model request contains instructions, typed input, a bounded schema projection, data,
and an output contract. The outgoing proposal reuses operation identity and input from the existing
invocation representation, not a parallel AI command language or Runtime Protocol family.

## Execution Slices

1. Inventory reflection, operation binding, provider composition, authority propagation, and Todo
   input contracts; choose the smallest internal seam before introducing a public builder or package.
2. Implement interpretation and explicit context assembly. Prove a code-backed replacement with
   the same operation identity, inputs, and output contract.
3. Add the local provider and exercise a real model request. Keep deterministic fixture-based
   verification separate from nondeterministic model evaluations.
4. Add bounded effect application and Todo UI; record what happened when dispatch rejected a proposal.
5. Record evidence, unresolved questions, and reusable boundaries in Atlas and research 125.

## Non-Goals And Deferred Work

No tool loop, autonomous reads, batches, dependent invocations, automatic mutation retries,
conversation resumption, general executor-routing framework, or stable public LLM API.
Do not hold a database transaction open across model inference. Dispatch rechecks current validity;
a stale snapshot is not permission to mutate. Do not infer retry safety from the current protocol.

- [153a](../backlog/153a-model-execution-security-and-authorization.md) owns prompt-injection and
  authorization hardening before broader or production use.
- [153b](../backlog/153b-declarative-operation-context-scope.md) owns declarative graph context scope.
- [153c](../backlog/153c-operation-interactions-and-resumption.md) owns implementation-neutral interactions.
- [132](../next/132-durable-invocation-identity-and-idempotency.md) owns invocation identity and retry semantics.

Existing authorization and validation remain mandatory in the spike; comprehensive defenses are
follow-up work, not implied by a successful demo. Use disposable local Todo data for the proof.
Remote provider adapters, including a possible Vercel AI Gateway binding, follow evidence from the
provider seam; this plan does not require another provider integration.

## Acceptance And Verification

- [x] Both example commands work end to end against a real local model and update the Todo UI.
- [x] Interpretation runs through the ordinary operation surface and canonical result lifecycle.
- [x] A code-backed interpreter replacement preserves the public operation contract and callers.
- [x] A provider test double can replace Ollama without changing domain operations or dispatch.
- [x] Only authorized current-list context is included; an omitted/truncated candidate set cannot
      establish uniqueness and must produce an unresolved result when relevant.
- [x] Missing and ambiguous targets produce no mutation; explicit resolved targets use canonical refs.
- [x] Invalid output, disallowed operations, out-of-scope targets, and denied authority produce no mutation.
- [x] Dispatch failure is displayed honestly and never represented as successful model execution.
- [x] Provider failure, timeout, and cancellation terminate cleanly without automatic effect retries.
- [ ] Evidence records provider/model, context selection, proposed invocation, and dispatch outcome
      with a deliberate local logging policy; secrets are excluded.
- [ ] Evaluation examples and limitations are recorded without claiming a passing sample proves security.

## Decisions, Open Questions, And Closure

Intent resolution and model-backed execution are distinct and composed here. One model call and one
possible invocation provide the first useful proof. Explicit context precedes declarative scoping.
A terminal unresolved result precedes a resumable interaction protocol.

Resolve during the spike: minimal executor binding, reflected descriptions sufficient for useful
interpretation, context size limits, provider structured-output limitations, and package ownership.
Close with evidence for each acceptance item and a recommendation about which seams should become
public. Do not expand into Atlas editing or agent infrastructure to close this plan.

## Local Implementation Evidence — 2026-09-20

The first implementation lives entirely in `examples/todo-express/src/command-chat` plus the Todo
operation declarations and optional React chat panel. `TodoList.interpretCommand` and
`TodoList.submitCommand` preserve the normal operation dispatcher, authentication requirements,
input/output validation, and invalidation. A typed runtime capability binds the implementation;
no new Core package, runtime protocol family, or public executor builder was necessary for this
first proof. Model provider, context reads, schema projection, validation, and application remain
separate responsibilities within the example.

Manual context uses explicit Graph Read policies and projected fields. The example's read policy
is intentionally public; this is evidence of policy reuse, not tenant isolation. Context limits
reject oversized/incomplete scopes rather than assuming the visible candidates are exhaustive.
Canonical operation input schemas are reflected dynamically; additional output restrictions narrow
creation to the supplied list and generated id, and completion to a singleton candidate Selection.

Deterministic checks cover code-backed replacement, no mutation during interpretation, two effect
paths, duplicate titles, missing/foreign refs, wrong output, denied principal/read policy, oversized
context, changes during inference, provider errors/timeouts/cancellation, and UI execution/failure
states. The complete Todo suite passed 93 tests, including HTTP/WebSocket and MySQL integration;
codegen check, server/client typecheck, lint, and example build also passed.

Ollama 0.34.2 with qwen3.5:0.8b was evaluated on disposable in-memory data. The initial prompt
misclassified “complete buy tea” as creation. Explicit bilingual action guidance corrected that
case, and creation/completion then succeeded. A request to complete missing “coffee” still selected
an unrelated valid candidate. The executable evaluation intentionally reports this failure.
Duplicate-title ambiguity was rejected by runtime code even when the model chose a candidate.
These results demonstrate why valid structure and authorized scope do not prove correct intent.

Plan remains current: compare a stronger small local model, broaden intent evaluations, and decide
the minimum useful redacted trace before closing it. Provider timeout/cancellation is verified;
there is no user-facing cancellation or cross-channel continuation protocol. Re-reading before
dispatch is not an atomic compare-and-mutate guarantee. Security hardening remains in 153a.

A comparison with qwen3.5:2b was attempted but its download repeatedly stalled after a registry
connection reset; it was stopped with no evaluation result. The installed 0.8B model remains the
local baseline. Re-run the documented evaluation after a successful stronger-model download.

## UI And Scope Feedback

The chat now floats at the bottom center, with a list selector, compact composer, embedded send
arrow, and Command/Ctrl+Enter. It shows the latest exchange as chat bubbles, with an expandable
local history and no repeated list headers. History remains presentation state, not model memory.
List creation was missing from the original operation allowlist; user feedback expands the proof
to TodoList.createList and a nullable current-list Ref. Context and output validation still enforce
that item operations cannot run without a selected list.

The hand-built context and example-owned `app.runtime.commands` dependency are deliberately local
seams. They are not automatic graph-scope inference or a native Core LLM API. Separating proposal
from execution is useful, but does not require two public operations. Revisit whether one public
chat operation with an internal interpreter is sufficient, and whether TodoList is an appropriate
owner for global intent resolution, before promoting these APIs beyond the spike.

The revised provider contract separates the user prompt from serialized context data. Dynamic input
schemas remain in context, while the output grammar exposes one operation-id enum and runtime
validation enforces the chosen operation's exact contract. The final qwen3.5:0.8b evaluation passed
six cases: add an item, complete an item, reject duplicate/missing targets without effects, and
create a list named Holidays with and without a selected list. A real browser Command+Enter
submission also created Groceries as a list. This small evaluation is evidence of improvement,
not a reliability or prompt-injection guarantee. Full Todo suite: 98 tests.

## Reusable interpretation and command regressions

Core now owns the provider-neutral interpretation mechanism and invocation scope validation.
Todo owns the per-operation argument projection, bindings, data scope, and messages; Ollama stays
outside Core and no longer imports Todo contracts. The model supplies names/titles while runtime
code builds IDs, Refs, and Selections. A second-domain Document rename test and packed-consumer
proof exercise the same mechanism without Todo.

Visible list names now permit `TodoItem.deleteList`, including its existing item cascade. All
maintained examples and evaluation requests are English. The seven-case real Ollama evaluation
passes, including `add item buy hamburgers`, `complete buy bread`, and `delete list Groceries`.
Unresolved explanations still depend on the 0.8B model. Further reliability work remains open.
The static client generator cannot follow the imported Core interpretation schema value, so Todo
keeps an inline equivalent output schema; this codegen limitation remains explicit.

Validation of this slice: 1,126 Core tests, 102 Todo tests, package typechecks/lint/build,
seven live Ollama cases, and clean-room tarball installation/type/runtime verification. The local
server was restarted on port 3003 after preserving six lists, nine items, and three tags.

## Runtime entry and declaration metadata

The next slice removes Todo's interpret/submit domain wrappers and chat runtime capability.
`createModelCommandRuntime` in Core owns interpretation, fresh-scope validation, and canonical
dispatch; Express exposes it through an optional `/model/commands` route with the normal invocation
context. The UI calls that single runtime entry. Descriptions live on the existing operation
metadata and are reflected into the catalog. Todo supplies scoped data and argument bindings,
not duplicate operation descriptions or an orchestration service.

Interaction focus is optional. Named-list item creation/completion and list deletion work without
selecting a list. Unique completion targets can resolve across visible lists; ambiguity stays
unresolved. The bounded read scope is now the authorized visible graph, while selection is only a
resolution hint, not a disclosure or permission boundary. Automatic graph scoping remains in 153b.
The real-model test is explicitly named `commands.evaluation.ts` and passes eight cases on 0.8B.
This slice does not add general graph questions or resumable conversations.

Validation: 1,131 Core tests, 46 Express tests, 100 Todo tests, affected lint/typechecks/builds,
and clean-room package type/runtime checks including HTTP dispatch through the new entry.
Eight live Ollama cases passed. The local port 3003 instance retains its existing board data.

## Browser dictation and deletion regression

The composer now uses browser SpeechRecognition (including the prefixed implementation) to fill
the editable draft, with interim results, stop/error/permission handling, and cleanup on unmount.
It never submits automatically. The browser language is used; browser recognition may send audio
to its own online service, while the Todo backend receives only the submitted text. Real microphone
input requires user verification; lifecycle behavior is covered with browser API test doubles.

The reported `delete list Nueva` failure was reproduced with the small local model. Separating
context data and the actual request into distinct Ollama messages, plus argument-extraction
guidance, passed the expanded ten-case evaluation. The two-list deletion remains unsupported and
returns an explicit one-action limitation with no effects in the regression. Batching is not added.

Validation: 103 Todo tests, typecheck, lint, server/client build, and ten live Ollama cases.
Browser inspection confirmed the microphone control is exposed and enabled; no live recording
was started. The local instance was restarted with its five lists, nine items, and three tags preserved.

## Text-only Todo interaction

Todo removes the list selector, list prop, focus request data, and selected-list context handling.
The UI submits only text. Completion resolves across visible unfinished items; ambiguous matches
ask for the title and list. Creation needs a list named in the message. Core's optional generic
interaction context remains available for other consumers but is not used by this example.

The live banana regression exposed an invented model qualifier that selected one of two matches.
Todo now accepts list qualifiers only when the corresponding name appears as whole normalized words
in the instruction. Unmentioned model qualifiers are ignored for completion, preserving global
uniqueness checks. This is an explicit example binding policy, not general semantic resolution.
Bindings may supply an unresolved explanation; Todo uses it to ask for the list without executing.

Validation: 1,132 Core tests, 105 Todo tests, affected typecheck/lint/build, and twelve live Ollama
cases passed. Port 3003 now serves the simplified composer with the existing board preserved.

## Informational responses and browser read-aloud

The reported “what things can I do?” response exposed the binary resolved/unresolved contract.
Core now accepts a strict `{status: "help"}` interpretation without model-written prose or invocation,
reauthorizes after inference, and renders an `answered` message from exposed descriptions without
dispatch. Bindings may narrow a description when their arguments narrow the operation's behavior.
An attempted free-form `answered` branch caused repeated hallucinations and action regressions with
0.8B, so arbitrary factual answers remain deferred. Help renders authored English descriptions;
clarification wording remains prompt guidance. No read loop or conversational state is introduced.

Todo adds an opt-in speaker control using browser speech synthesis and the existing EN/ES choice.
Enabling reads the latest response and then new replies. Dictation, new submission, language change,
disabling, and unmount cancel playback. Speech language does not translate the textual response.
Browser lifecycle is verified with test doubles; audible voice quality remains a manual check.

The expanded real-model evaluation also exposed a partial two-list deletion under the changed
prompt. Todo conservatively rejects deletion requests mentioning multiple visible list names in
its binding, independently of the model choosing only one. This name-based policy may also ask for
clarification on comparisons or overlapping list names; it is not general semantic intent validation.

Validation: 1,137 Core tests and 108 Todo tests passed, followed by two focused HTTP client
contract tests for the new response status. Core and Todo lint/typecheck/build passed. Thirteen
live Ollama cases passed, including capability help without internal IDs or invented item state.
The local server was restarted on port 3003 with six lists, ten items, and three tags preserved.

## Recall and response language

ArrowUp in an empty chat draft recalls the most recent request, without submitting or overwriting
an existing draft. EN/ES now travels as `language` on each request. Core validates BCP 47 language
tags before disclosure and instructs the model to use that response language while preserving names.
Todo localizes fixed binding messages and exposed descriptions. An optional host `formatHelp` hook
formats the capability introduction without model-generated prose or a second translation call.
Technical transport/provider diagnostics are not a full localized product surface in this spike.

The reported “now add item fix the door in house” failure was reproduced with the visible house
list. Interpretation guidance distinguishes task titles from requested graph changes and treats
“in” and “to” as destination phrasing; the canned deletion-only error example was removed.
A complete structured example for this phrasing improved the regression without changing bindings.

Validation: 1,142 Core tests, 113 Todo tests, affected lint/typecheck/build, and seventeen real
Ollama cases passed. This includes the exact house command, English requests with Spanish selected,
localized help and confirmations, and a missing-destination clarification.

## Entity update outcome: rename

Model interpretation now admits one explicitly scoped entity update alongside invocation/help/
unresolved. The target is projected as a list name or item title plus optional list name; values
are projected from the entity field schema. Todo exposes only list name and item title, including
completed items. No domain rename operations are introduced.

Core binds the proposed target to a canonical EntityMutationCommand, reloads scope and rechecks
uniqueness and identity before calling the host's Graph Command dispatcher. Todo shares the
existing browser-write policies, adding an old-name condition allowlist for list updates; item
updates already allow old-title conditions. Conditional writes catch target changes at execution.
Schema validation, missing/ambiguous targets, revoked authorization, removed exposure, and rejected
graph commands cannot produce an executed result. Automatic editable-field discovery, colors,
batching, and broader intent/security hardening remain follow-ups.

The small model omitted an explicit list qualifier in one rename proposal. Todo's binding now
recognizes bounded `in <list>` / `en <list>` qualifiers in the original request as a fallback,
requiring a unique visible list and rejecting invented qualifiers. This is conservative example
scoping, not general natural-language target resolution.

Validation: 1,147 Core tests, 125 Todo tests, affected lint/typecheck/build, clean-room packed
artifact verification, and 21 real Ollama cases passed. The local instance preserves its five lists,
nine items, and three tags. Model-written unresolved explanations can still be inaccurate; the
checks prove the tested mutations and non-mutations, not broad language-model reliability.
