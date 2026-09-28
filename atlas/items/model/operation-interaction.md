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
