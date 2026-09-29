---
id: ontahi.model.operation-interaction
kind: concept
title: Operation Interaction
parent: ontahi.model.domain-operation
status: shaping
horizon: later
supports:
  - ontahi.model.domain-operation
  - ontahi.model.intent-resolution
relatedPlans:
  - ontahi://plans/153c-operation-interactions-and-resumption
  - ontahi://plans/153a-model-execution-security-and-authorization
  - ontahi://plans/153d-langgraph-task-runtime-comparison
  - ontahi://plans/153e-vercel-workflow-interaction-resumption
  - ontahi://plans/153f-queue-backed-task-runtime
---

Operation Interaction names the emerging need for an operation to obtain information or a decision
from a participant before proceeding. The need is independent of whether the implementation is
code-backed or model-backed and whether its host presents chat, a CLI prompt, or Devtools controls.

Clarification, choice, and acceptance of specified effects have different semantics. Answering a
question does not by itself grant authority. Any eventual continuation must preserve participant
identity and recheck authority and relevant state before applying effects.

A semantic interaction request and its typed response are distinct from host rendering and provider
message history. The experimental contract adds choice and approval Interactions to a running
durable Operation snapshot and accepts their responses through the existing `durable.operation`
protocol. An approval exposes a stable proposal identity, summary, and exact JSON-safe requests;
the in-process runtime retains the response and resumes only the matching Interaction. Lifecycle,
expiry, persistence, cancellation, richer participant authorization, and transactional proposal
dispatch remain under investigation in plan 153c.

The Todo experiment now exercises both kinds in one code-backed durable Operation. Duplicate list
names produce a choice over stable list IDs. The selected list is projected into exact canonical
Graph Commands for relationship unlinks and item deletions, and those requests are shown in the
approval proposal. On approval the Operation rebuilds the proposal from current graph state and
executes only when the canonical requests still match. The in-process runtime preserves the
invoking Principal as the default run actor. The Todo workflow is now an explicit JSON-safe state
machine with named resolution, choice, proposal, approval, and execution steps. The runtime advances
the machine after an accepted response instead of retaining a Promise continuation for that
Operation.

The command sequence is intentionally non-atomic. A concurrent change after revalidation or a
failure during sequential dispatch may still produce partial effects. Restart-safe continuation,
transactional proposal execution, and UI-independent participant policy remain open design work.
The Todo app's authentication-disabled mode owns runs with the shared system actor, so possession
of a run reference is sufficient to answer its Interaction. That is suitable only for the local
public example; user-attributed approval requires an authenticated actor or a future run-specific
claimant mechanism.

The Devtools Console is the first generic surface projection. When an Operation invocation returns
a Task Run identity, it observes the run through the existing durable Operation transport and
renders progress, choice, approval, failure, and completion. Its controls answer Interactions with
the canonical Runtime Protocol request, so Devtools adds presentation without owning a parallel
conversation or continuation contract.

Devtools Activity projects the same pending choice or approval from observed run snapshots and can
answer it through that same protocol. A transient WebSocket session loss now causes the client to
observe the same Task Run identity again, rather than converting a still-live run into a terminal
transport error. Recovery uses bounded exponential retries and surfaces the transport error after
repeated failures. This reconnect behavior recovers observation only. Legacy function-style Tasks
still wait on process-local continuations, while explicit execution machines persist their current
state and pending Interaction through Task Storage.

The Todo model-command path now consumes the same primitive for resumable clarification. Model
interpretation may produce a typed choice only when every option is backed by disclosed context and
contains a complete canonical request for the same action. The chat answers through
`durable.operation`; the selected request is reauthorized and revalidated as a choice before
dispatch, without another model call. Unambiguous effects execute directly. Approval is an optional
host policy for effects that require explicit acceptance rather than a blanket consequence of using
a model. This is a bounded clarification continuation, not conversational memory.

A potential continuation can cross surfaces: a CLI asks for a list and the participant answers
“this list” from the browser. The host's selected Entity Ref can inform resolution only through an
explicitly correlated and authorized interaction context. Principal identity, connection sessions,
conversation identity, and operation-run identity remain distinct; one user may have multiple
unrelated tabs and CLI sessions. Ambient selection needs surface identity and freshness, and must
be captured as a concrete target before acceptance or execution.

Durable Operation runs provide the first experimental lifecycle for a workflow that reports progress
and then waits for participant input. A code-backed workflow can issue the same semantic request as
a future model-backed one. Explicit execution machines now persist JSON-safe state and atomically
claim an Interaction response before resuming. Legacy suspended functions remain process-local;
correlation and visibility rules remain framework design work rather than chat-provider behavior.

The explicit execution checkpoint is stored by `TaskStorage`. A recovering runtime reconstructs
current authority and graph capabilities from application configuration and run metadata rather
than serializing them. Credentials and live capability objects are not checkpoint data. The
LangGraph comparison now exercises this same public contract with provider-owned replay state kept
behind the Task Runtime adapter.

Current research favors reusing canonical Graph Read, Graph Command, and Operation Invocation
contracts rather than wrapping them in a second universal effect language. Interaction is the
missing typed request/reply primitive; progress is lifecycle observation, while suspension and
resume are runtime mechanics. A workflow runtime such as LangGraph may provide checkpoint/replay
and interrupt plumbing through an optional adapter, but its thread, node, and command concepts do
not define Ontahí's public Operation or Interaction model.
