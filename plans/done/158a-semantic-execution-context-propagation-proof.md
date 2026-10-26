# 158a. Semantic Execution Context Propagation Proof

Status: done

Canonical ID: `ontahi://plans/158a-semantic-execution-context-propagation-proof`

Parent: [158. Semantic Execution Context, Governance And Evidence](../research/158-semantic-execution-context-governance-and-evidence.md).

Shapes: [Semantic Subjects And Runtime Concerns](../../atlas/items/model/semantic-subjects-and-runtime-concerns.md).

## Summary

Implement the first bounded proof from Plan 158: one runtime-owned causal execution family crosses
the existing invocation, Operation, Intent Resolution, in-process Task and model-provider
boundaries. Each provider call becomes a distinct Resource attempt attributed to its semantic owner,
and Devtools exposes the safe attribution beside normalized usage.

This slice proves propagation and vocabulary, not governance or durable audit storage. It composes
existing runtime boundaries and retains evidence only where model usage already appears.

## Context shape and trust

The server runtime creates a root execution and correlation identity at the invocation boundary.
Nested activities preserve correlation and receive new execution, causation and parent identities:

1. an Operation activity owns model usage produced by a model-backed Operation;
2. an Intent Resolution activity owns model usage produced while interpreting a model command;
3. every provider call creates a Resource-attempt activity;
4. model usage projects only attempt, correlation, causation, owner and admitted origin.

The receiver may attach an origin channel, surface and client-instance handle. These values are
bounded provenance for debugging and attribution. They do not establish Principal, authority,
cache scope, accounting ownership or policy scope. Caller-authored Runtime Protocol exchange IDs
are not promoted into trusted correlation identities.

The Todo proof sends one browser-generated tab handle on HTTP model-command requests. The Express
receiver validates the claim before admitting it. WebSocket connections receive a server-generated
connection handle. The public invocation API accepts the receiver-admitted projection; execution
identity minting remains internal to the runtime.

## Scope

1. Add a trusted ambient semantic execution lineage beside the existing invocation context.
2. Derive Operation and Intent Resolution child activities at their real runtime boundaries.
3. Derive one Resource attempt for each provider generation and attach safe attribution to usage.
4. Preserve the initiating lineage when the current in-process Task runtime schedules model work.
5. Strictly parse the new bounded usage projection over the Model Command protocol.
6. Render Resource attempt, correlation, owner and origin in Devtools.
7. Demonstrate distinct browser tabs for the same authenticated Principal.

## Non-goals

- Durable propagation across process restart, remote Task execution or serialized continuation.
- A Session, Interaction-routing or per-affordance browser API.
- Resource budgets, quotas, prices, authorization decisions or accounting ledgers.
- Persistent audit storage, mandatory telemetry export or new Domain Events.
- Provider retry policy or aggregation of several attempts into one charge.
- Placing execution metadata in domain inputs, graph values, prompts or model-controlled output.

## Acceptance checklist

- [x] A top-level invocation receives runtime-owned execution and correlation identities.
- [x] Operation and Intent Resolution create distinct semantic owner activities.
- [x] Each model provider call creates and reports a Resource-attempt identity.
- [x] Usage attribution crosses the current in-process Task boundary.
- [x] Two tabs sharing one Principal remain distinguishable without making the tab authoritative.
- [x] The protocol rejects unknown, empty, oversized or malformed activity fields.
- [x] Devtools renders safe attribution without prompts, results, credentials or graph context.
- [x] The Todo example admits a bounded browser-tab handle at its receiver boundary.
- [x] Focused tests, package typechecks/lint and artifact verification pass.

## Follow-ups opened by the proof

Plan 125a can use the proven Resource attempt and owner identities for quotas and accounting. Plan
158 retains durable resume, cross-surface Interaction routing, audit adapters, Entity change
evidence and general Operation governance. A future client interaction model may supply a semantic
surface per affordance; this slice only proves that the origin projection can carry it safely.
