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

A semantic interaction request and its typed response should be distinct from host rendering and
provider message history. Their exact contract is intentionally undecided: plan 153c investigates
new invocation versus resumption, lifecycle, expiry, persistence, cancellation, and duplicate replies.
No canonical result variant or durable interaction protocol is established by this item.

The first Todo LLM spike returns a terminal unresolved result and requires a new explicit request.
It supplies evidence for this direction without implementing conversational continuation.

A potential continuation can cross surfaces: a CLI asks for a list and the participant answers
“this list” from the browser. The host's selected Entity Ref can inform resolution only through an
explicitly correlated and authorized interaction context. Principal identity, connection sessions,
conversation identity, and operation-run identity remain distinct; one user may have multiple
unrelated tabs and CLI sessions. Ambient selection needs surface identity and freshness, and must
be captured as a concrete target before acceptance or execution.

Durable operations are a candidate lifecycle for a workflow that reports progress and then waits
for participant input. A code-backed workflow could issue the same semantic request as a model-backed
one. The continuation, correlation, and visibility rules are future framework design work rather
than chat-provider behavior or an assertion that current durable operations support user waits.
