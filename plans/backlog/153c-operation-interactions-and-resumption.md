# 153c. Operation Interactions And Resumption

Status: backlog

Canonical ID: `ontahi://plans/153c-operation-interactions-and-resumption`

Shapes: [Operation Interaction](../../atlas/items/model/operation-interaction.md).

## Summary And Context

An operation may need missing information, a choice, or acceptance of specific effects. This can
arise in code-backed and model-backed implementations alike, and can be presented in chat, CLI,
or Devtools. [Spike 153](../current/153-model-backed-todo-command-spike.md) deliberately stops at a
terminal unresolved result; it does not implement resumable conversations.

## Scope And Execution Slices

1. Compare two concrete cases: ambiguous Todo reference selection and a code-backed operation
   requiring a user decision. Identify the shared semantic request and typed reply.
2. Decide when a reply starts a new invocation versus resumes an existing execution. Specify
   identity, ownership, persistence, expiry, cancellation, and concurrent replies.
3. Define authorization rechecks and stale-data behavior; distinguish clarification from approval
   of exact effects. Coordinate plans 132 and 153a before promising replay or acceptance semantics.
4. Prototype the same interaction through two host surfaces without embedding chat message syntax
   into the operation contract; evaluate its relation to durable execution.

## Acceptance And Verification

- [ ] Both code and model implementations express the same kind of required decision.
- [ ] Typed replies and invalid, duplicate, expired, and unauthorized responses have defined outcomes.
- [ ] A clarification does not silently grant new execution authority or approve unrelated effects.
- [ ] Two host projections preserve the interaction's identity and semantics.
- [ ] The result explains the boundary between immediate unresolved results and suspended execution.

## Non-Goals, Open Questions, And Closure

No universal conversation framework, autonomous agent memory, or requirement that all operations
become durable. Determine whether interaction belongs in a result contract, a lifecycle protocol,
or a composition of both. Close with evidence and a minimal contract proposal; do not freeze a
new canonical result variant before that investigation.

## Cross-Surface Continuations

Investigate an interaction/session context shared by an authenticated participant across browser
and CLI surfaces. Example: a CLI operation asks which list to use; the participant selects a list
in the browser and replies “this list”. Resolve that deictic reference against explicit surface
context, then submit a typed answer to the pending interaction. Another example is “delete the plan
I am viewing on the web” from a CLI; destructive acceptance must bind the resolved target, not a
mutable ambient “current” pointer.

Distinguish authenticated Principal, browser/CLI connection session, conversation or interaction
session, and durable operation run. Shared identity alone does not imply that every surface can
observe every other session. Define opt-in correlation, discoverability, target surface selection,
ownership, authorization, freshness, expiry, and ambiguity when several tabs are active. Capture
concrete refs at resolution time; recheck them at continuation/execution time.

A durable workflow may publish progress and then wait for a typed participant response. Explore
this as implementation-neutral operation lifecycle behavior, including code that prompts a user;
an LLM may interpret the answer but does not own continuation or session correlation. This remains
outside spike 153 and requires explicit security design with plan 153a.
