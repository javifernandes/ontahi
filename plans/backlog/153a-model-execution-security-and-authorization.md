# 153a. Model Execution Security And Authorization

Status: backlog

Canonical ID: `ontahi://plans/153a-model-execution-security-and-authorization`

Shapes: [Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md),
[Intent Resolution](../../atlas/items/model/intent-resolution.md),
[Authority And Policies](../../atlas/items/authority-and-policies.md).

## Context And Scope

Follow [spike 153](../current/153-model-backed-todo-command-spike.md) with a threat model and enforceable
security boundaries before general-purpose or production model-driven mutations. Prompt injection
and strong authorization coupling are explicit required work, not solved by structured output,
allowlisted tool names, or prompt wording alone.

Cover direct instructions and indirect injection in graph data, reference labels, retrieved text,
and future tool results. Treat these as untrusted content rather than runtime policy. Separate
permission to read data, disclose it to a provider, propose an invocation, and execute its effects.
The model must not mint principal identity, expand graph scope, or act with ambient server privilege.

## Execution Slices

1. Map trust boundaries from UI and authorized context through provider, proposal, and dispatcher.
2. Specify enforceable field/row scope, capability limits, provider egress policy, and authority
   propagation. Recheck authorization and target validity at execution time.
3. Define when automatic application is permitted and when a reviewable proposal needs acceptance;
   bind acceptance to exact effects and scope, with stale proposal handling.
4. Add adversarial evaluations for injection, exfiltration, cross-list/tenant writes, confused-deputy
   behavior, fabricated refs, permission changes, and misleading model claims of success.
5. Define bounded resources, redacted telemetry, retention, cancellation, and duplicate/retry behavior
   in coordination with plan 132. Record residual risks and deployment requirements.

## Acceptance And Verification

- [ ] Trust boundaries and enforcement owners are documented and exercised with negative tests.
- [ ] Unauthorized reads, disclosure, and mutations are rejected independently of model compliance.
- [ ] Model-provided identity or instructions cannot override authenticated runtime authority.
- [ ] Review policy identifies which effects may run automatically and what acceptance authorizes.
- [ ] Adversarial evaluations include injected domain data and changed authority between proposal and execution.
- [ ] Security evidence and remaining limitations are recorded before recommending broader deployment.

## Non-Goals And Closure

No claim of universal prompt-injection prevention and no replacement identity system. This work
hardens the shared Ontahi execution boundary; Atlas-specific review UX belongs to its host.
Close with a reviewed threat model, enforcement evidence, and explicit supported deployment scope.
