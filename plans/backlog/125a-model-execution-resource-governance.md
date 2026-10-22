# 125a. Model Execution Resource Governance

Status: backlog

Canonical ID: `ontahi://plans/125a-model-execution-resource-governance`

Parent research: [125. Ontahi AI Operations](../research/125-ontahi-ai-operations.md)

Shapes: [Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md),
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md).

## Summary

Investigate provider-neutral measurement and control of model consumption after the first genuine
model-backed Domain Operation establishes the executor boundary. The same governance vocabulary
should cover model use inside an Operation and model use for Intent Resolution without treating
either provider messages or billing APIs as application semantics.

The problem includes observing usage, attributing it to the correct semantic work, declaring and
enforcing limits, and making incomplete or estimated evidence explicit. A system should be able to
answer questions such as:

- How many model requests and reported input/output/reasoning tokens did this Operation Run use?
- Which Operation, intent resolver, application, tenant, Principal, or executor binding owns that
  usage?
- Which time, token, request, concurrency, or monetary budget applies before another model call?
- Did execution finish inside its budget, stop because the provider supported cancellation, or
  merely report an overrun after the provider returned?
- Which measurements are exact provider evidence, locally derived estimates, or unavailable?

“Resource governance” is deliberately narrower than billing and broader than rate limiting. It
combines usage evidence, policy scopes, admission, enforcement, and operational visibility while
keeping each concern independently replaceable.

## Generalization Pressure: Governed Services

A model provider is one instance of a broader runtime concern: an external or scarce service with
latency, availability, concurrency, quota, rate, and monetary constraints. Paid APIs, search
providers, geocoders, storage services, and partner systems may need the same admission,
attribution, measurement, cancellation, and visibility vocabulary even when no model is involved.

Keep that generalization visible, but do not begin this spike by inventing a universal service
abstraction. First derive the smallest ports from two existing model consumers. Then compare those
ports with Ontahi concerns, rate limiting, telemetry, runtime capabilities, and at least one real
non-model service. Promote only the genuinely shared lifecycle and resource-policy concepts;
provider-specific tokens, prompts, structured generation, and model identifiers remain model
adapter evidence.

## Relationship To Authority

Authorization and resource governance form a sequence but remain different decisions:

```text
authorization
  may this Principal use this semantic capability over this application scope?
        ↓ allowed
resource policy
  with which request, token, time, concurrency, provider, or cost envelope?
        ↓ admitted
execution + usage evidence
```

Trusted application authority may select the applicable resource policy from environment, tenant,
Principal, role, Operation, intent-resolver, or executor-binding context. More specific scopes can
only narrow the resulting envelope. The request body and the model cannot mint a larger budget,
choose a privileged accounting owner, or move usage to another Principal or tenant.

The outcomes must remain distinguishable. Permission denial, resource-limit exhaustion, provider
capacity failure, budget cancellation, and successful execution with reported usage are not aliases.
A positive budget never grants graph or Operation authority, and authorization alone does not
promise that capacity remains available.

## Ordering

Do not implement this Plan before one model-backed Domain Operation exists. Intent Resolution
already exposes useful model calls, but designing the shared abstraction from that path alone would
risk coupling all model usage to `model.command`. The executor proof should reveal the common
invocation, lifecycle, cancellation, outcome, and telemetry seams first.

This Plan does not require code-backed and model-backed implementations to run simultaneously.
Feature flags, rollout, shadow execution, fallback, and binding migration are adjacent routing
policy; they may consume usage evidence later but do not define this governance contract.

## Questions To Resolve

1. Which usage facts can be normalized without claiming that provider token classes, cached input,
   reasoning tokens, tool calls, latency, or prices are equivalent?
2. Is the stable semantic identity a model attempt, executor attempt, Operation Run activity, or a
   smaller metered unit correlated with all three?
3. Which budget scopes compose: application, environment, tenant, Principal, Operation, intent
   resolver, executor binding, run, or individual attempt?
4. How do nested scopes combine without allowing a local declaration to widen a host limit?
5. Which limits are enforceable before a call, during streaming/generation, or only observable
   afterward?
6. How should retries and fallback distinguish another charged attempt from continuation of the
   same semantic run?
7. Which policy and aggregate evidence may be reflected safely to developers, operators, users,
   and models?
8. Which current rate-limit, telemetry, runtime concern, and durable-run contracts can be composed
   instead of creating a model-only control plane?
9. Does authority select a named resource policy, derive an immutable execution envelope, or both,
   and which parts may be disclosed through reflection?
10. Which resulting ports describe governed services generally, and which remain irreducibly
    specific to model generation?

## Proposed Experiment

Use the first model-backed Operation plus the existing Intent Resolution path:

1. define a small provider-neutral usage record with explicit `reported`, `estimated`, and
   `unavailable` evidence;
2. correlate every model attempt with its semantic family, Operation/Program Run when present,
   provider/model binding, authority scope, timing, and outcome;
3. enforce one preflight request/concurrency limit and one provider-supported generation limit;
4. apply a stricter per-Operation policy beneath a broader host or tenant ceiling and prove that
   composition can only narrow authority to consume resources;
5. expose redacted live evidence through telemetry or Devtools without retaining prompts, model
   output, credentials, or private graph context by default;
6. compare an Intent Resolution attempt and a model-backed Operation attempt through the same
   metering port while preserving their different semantic identities.

## Non-Goals

1. Do not build customer billing, invoicing, subscription plans, or payment integration.
2. Do not embed provider pricing tables or credentials in the semantic application model.
3. Do not pretend tokens or monetary cost are portable when a provider cannot report comparable
   evidence.
4. Do not make telemetry evidence the source of authorization or accounting truth without a
   separately proven durable store.
5. Do not design general feature flags, multi-executor routing, shadow evaluation, or automatic
   fallback in this Plan.
6. Do not add a generic resource scheduler for CPU, memory, storage, or non-model workloads unless
   the model experiment proves a genuinely shared contract.
7. Do not require domain Operation inputs to carry budgets, provider names, prices, or usage IDs.

## Acceptance And Verification

- [ ] Intent Resolution and one model-backed Operation emit the same minimal provider-neutral usage
      evidence while retaining distinct semantic activity identities.
- [ ] Exact, estimated, and unavailable measurements remain distinguishable.
- [ ] Policy scopes and precedence are explicit, and a narrower scope cannot widen a host ceiling.
- [ ] Authenticated authority selects the accounting/resource scope; request or model output cannot
      enlarge the budget, change its owner, or convert capacity into data/Operation permission.
- [ ] Authorization denial, resource exhaustion, provider capacity failure, and budget cancellation
      remain distinct typed outcomes with explicit enforcement owners.
- [ ] One limit rejects work before provider disclosure or cost, and one supported generation limit
      propagates cancellation or a precise bounded outcome.
- [ ] Retry and multiple-attempt usage are additive and never presented as one uncharged execution.
- [ ] Telemetry and Devtools can display redacted usage, limit, and outcome evidence without raw
      prompts, results, credentials, or graph context by default.
- [ ] Provider-specific token and cost fields remain adapter evidence unless two independent
      providers justify a shared semantic contract.
- [ ] The experiment records what requires durable accounting and what may remain observational.

## Closure

Close with an evidence-backed recommendation for the smallest shared metering and policy ports,
their runtime ownership, and their relationship to existing concerns, rate limiting, telemetry,
Task/Program Runs, and provider adapters. Extract durable accounting, feature flags, billing, or
multi-binding routing only when the experiment supplies a concrete consumer.
