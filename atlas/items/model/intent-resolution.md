---
id: ontahi.model.intent-resolution
kind: concept
title: Intent Resolution
parent: ontahi.model.operation-invocation
status: shaping
horizon: next
supports:
  - ontahi.model.operation-invocation
  - ontahi.model.model-backed-operation-execution
  - ontahi.semantic-interaction-language
relatedPlans:
  - ontahi://plans/125-ontahi-ai-operations
  - ontahi://plans/153-model-backed-todo-command-spike
  - ontahi://plans/153a-model-execution-security-and-authorization
  - ontahi://plans/153b-declarative-operation-context-scope
---

Intent Resolution maps a human request and its relevant context to a proposed typed
[[ontahi.model.operation-invocation|Operation Invocation]], or reports that the request cannot be
resolved. Text and voice are possible ingress surfaces; a model is one implementation choice.
Resolution can itself be a typed Domain Operation without making its proposal authoritative.

Schema explains entities, relationships, and operation contracts. Instance context supplies concrete
identities and candidate targets. A current-list Ref supplied by the UI can anchor “add bread”; a
list name in text still requires instance resolution. An incomplete candidate set cannot establish
uniqueness. Missing or ambiguous targets must remain unresolved rather than acquire invented refs.

The proposal reuses the canonical operation identity and input representation shared with code,
CLI, and Devtools. It is distinct from an executed invocation and its result. The runtime validates
it, enforces the permitted operation and target scope, and applies the caller's authority through
the normal dispatcher. Structured output and successful resolution do not establish permission.

The first proposed proof uses explicit authorized context assembly, one model call, and at most
one proposed invocation. Declarative graph scoping remains a follow-up. An unresolved result is
terminal for this proof; [[ontahi.model.operation-interaction|Operation Interaction]] investigates
how a later design could obtain a decision and continue across host surfaces.

Model-visible data and model output are untrusted. Prompt-injection defenses, provider disclosure
policy, and execution authorization require explicit enforcement beyond the prompt; plan 153a owns
that hardening. These are shaping semantics, not claims of an implemented secure execution mode.

Initial Todo evidence retains this distinction in executable form: interpretation alone has no
mutation effects, and submission applies the validated proposal separately. A small local model
produced an in-scope but semantically wrong completion for a missing target. Runtime candidate
limits and duplicate-title checks constrain effects, but do not certify understanding; intent
quality needs representative evaluations and unresolved behavior, separately from authorization.

The next Todo slice makes graph instruction processing a Core runtime capability with a dedicated
transport entry, removing the example's interpreter/submission domain wrappers. Operation
semantics and descriptions come from declarations; application bindings supply the remaining
argument resolution and bounded data scope. Optional interaction focus can help resolve “this”,
while explicit names work without UI selection. Focus is not authority. This graph-level entry is
distinct from using a model to implement a particular Domain Operation.

The graph instruction entry also supports a `help` interpretation for capability questions.
The runtime renders an `answered` message from the exposed operation descriptions without dispatch.
A binding can narrow a description when it narrows the operation's arguments. Canonical IDs remain
the machine protocol; authored descriptions are the natural-language presentation vocabulary.
Free-form factual answers remain deferred. Concise clarification wording is still prompt guidance,
not an enforcement or authorization mechanism.


An intent can also propose a canonical Graph Command instead of invoking a Domain Operation.
The resolved interpretation envelope contains the existing request directly, including disclosed
Refs, values, and conditional old values where required. The runtime validates the advertised
schema, reloads scope, and dispatches through the host's Graph Command policy boundary. Todo uses
this for field updates and individual item deletion without parallel domain operations or a
name-based intermediate mutation protocol. Automatic exposure discovery and semantic value
conversion remain separate work.

The next boundary is a reusable app capability configured with a provider and authorized graph
scope. Interpretation and its downstream execution should be correlated in Devtools Activity;
Natural console input should reuse that capability. Canonical reads and query-result presentation
are planned extensions, not implemented interpretation outcomes in the current spike.
