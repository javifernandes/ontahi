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
expiry, persistence, cancellation, richer participant authorization, stale-proposal verification,
and command dispatch after approval remain under investigation in plan 153c.

The Todo experiment now exercises both kinds in one code-backed durable Operation. Duplicate list
names produce a choice over stable list IDs. The selected list is projected into exact canonical
Graph Commands for relationship unlinks and item deletions, and those requests are shown in the
approval proposal. On approval the Operation rebuilds the proposal from current graph state and
executes only when the canonical requests still match. The in-process runtime preserves the
invoking Principal as the default run actor and uses a process-local Promise continuation so later
asynchronous reads and commands resume on the original Task execution.

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
repeated failures. This reconnect behavior recovers observation only. The in-process continuation
still waits without expiry only while the server process remains alive and is not restart-safe.

The first Todo LLM spike returns a terminal unresolved result and requires a new explicit request.
It supplies evidence for this direction without implementing conversational continuation.

A potential continuation can cross surfaces: a CLI asks for a list and the participant answers
“this list” from the browser. The host's selected Entity Ref can inform resolution only through an
explicitly correlated and authorized interaction context. Principal identity, connection sessions,
conversation identity, and operation-run identity remain distinct; one user may have multiple
unrelated tabs and CLI sessions. Ambient selection needs surface identity and freshness, and must
be captured as a concrete target before acceptance or execution.

Durable Operation runs provide the first experimental lifecycle for a workflow that reports progress
and then waits for participant input. A code-backed workflow can issue the same semantic request as
a future model-backed one. The initial in-process continuation is explicitly process-local; durable
checkpointing, correlation, and visibility rules remain framework design work rather than
chat-provider behavior.

Current research favors reusing canonical Graph Read, Graph Command, and Operation Invocation
contracts rather than wrapping them in a second universal effect language. Interaction is the
missing typed request/reply primitive; progress is lifecycle observation, while suspension and
resume are runtime mechanics. A workflow runtime such as LangGraph may provide checkpoint/replay
and interrupt plumbing through an optional adapter, but its thread, node, and command concepts do
not define Ontahí's public Operation or Interaction model.
