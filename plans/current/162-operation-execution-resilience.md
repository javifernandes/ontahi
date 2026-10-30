# 162. Operation Execution Resilience

Status: current

Canonical ID: `ontahi://plans/162-operation-execution-resilience`

Shapes: [Operation Execution Resilience](../../atlas/items/model/operation-execution-resilience.md),
[Operation Invocation](../../atlas/items/model/operation-invocation.md),
[Durable Operation](../../atlas/items/model/durable-operation.md).

Related plans:

1. [125a. Model Execution Resource Governance](125a-model-execution-resource-governance.md)
2. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)
3. [158. Semantic Execution Context, Governance And Evidence](../research/158-semantic-execution-context-governance-and-evidence.md)
4. [163. Operation Implementation Bindings And Variants](../research/163-operation-implementation-bindings-and-variants.md)
5. [153d. LangGraph Task Runtime Comparison](../done/153d-langgraph-task-runtime-comparison.md)

## Summary

Define retry and backoff as optional execution semantics of any Domain Operation rather than a
special behavior of model providers, workflow engines, HTTP clients, or application loops. One
Operation Invocation may contain several distinguishable execution attempts. The Operation keeps
one semantic identity and result contract; each attempt is separately admitted, attributed,
observed, and governed.

The first proof is deliberately immediate and in-process. A later durable runtime may persist the
same policy and schedule, but must advertise only the guarantees it actually implements.

## Motivation

The first model-backed application evidence exposed a hand-written provider loop that chooses three
attempts, sleeps between them, parses output, and logs failures outside Ontahí. Model Resource
Governance can now admit and account for each provider attempt, but it intentionally does not decide
whether another attempt should occur. Calling the same Operation several times would lose the
single-invocation meaning and is not an acceptable retry model.

This is not model-specific. Database contention, remote services, queue delivery, generated output,
and transient runtime capacity all raise the same questions:

1. which typed failures may cause another attempt;
2. how many total attempts are allowed;
3. when the next attempt may start;
4. whether already-observed effects make repetition unsafe;
5. which runtime owns the delay and continuation;
6. how attempts remain attributable to one invocation or durable run.

Workflow systems such as Temporal, Step Functions, and LangGraph provide useful execution machinery.
They remain adapters: provider task, node, state, and checkpoint types must not become Ontahí's
portable Operation contract.

## Semantic Boundaries

Keep these concepts separate:

| Concept            | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Invocation         | one semantic request to perform an Operation                            |
| Attempt            | one admitted execution of the selected implementation                   |
| Retry              | a policy decision to schedule another attempt for the same invocation   |
| Redrive            | a new administrative continuation after an execution already terminated |
| Replay/resume      | reconstruction or continuation of the same durable run                  |
| Fallback           | selection of a different implementation after failure                   |
| Idempotency        | protection against duplicate requests or repeated effects               |
| Resource admission | permission for one attempt to consume a bounded Resource                |

Retry policy requests another attempt. Resource Governance independently admits or rejects that
attempt. Authorization is rechecked at the boundary required by the runtime and never follows from
retry eligibility. A retry policy does not make effects idempotent or failures safe.

## Failure And Safety Model

Retry selection must use typed semantic failure categories, not provider status codes or arbitrary
exception classes embedded in application metadata. The first proof should support an explicit
allowlist over declared Operation failures and runtime-owned categories.

The runtime must distinguish at least:

1. failure before effects began;
2. failure inside an authoritative boundary that rolled back;
3. transient failure from a known external Resource;
4. invalid implementation output before domain effects;
5. ambiguous failure after an external request may have committed;
6. terminal domain rejection that another identical attempt cannot repair.

The first proof should automatically retry only failures known to occur before domain effects or
inside an authoritative boundary that rolled back. Ambiguous external effects require an
idempotency key, reconciliation, compensation, or an explicit operation-owned policy. Ontahí must
not claim exactly-once execution.

## Provisional Declaration Shape

The following is explanatory, not an accepted API:

```ts
operation({
  resilience: {
    retry: {
      maxAttempts: 3,
      when: ['dependency_unavailable', 'implementation_output_invalid'],
      backoff: {
        kind: 'exponential',
        initialMs: 750,
        multiplier: 2,
        maxMs: 30_000,
        jitter: 'full',
      },
    },
  },
});
```

`maxAttempts` counts the initial attempt and every retry. The declaration must not silently default
to retrying arbitrary failures. The final API may derive allowed failure names from the Operation's
typed result contract.

## Immediate And Durable Interpretation

An immediate runtime may execute a bounded delay while the invocation remains alive. Cancellation
ends the invocation and prevents further attempts. Process loss ends this guarantee.

A durable runtime may persist the attempt ordinal, next eligible time, selected implementation,
failure evidence, and remaining policy. Rehydration must not reset the budget. LangGraph, Vercel
Workflow, Temporal, Step Functions, and future runtimes may use native retry/checkpoint mechanics
only when they preserve the canonical lifecycle and evidence.

If an adapter cannot honor a declared resilience guarantee, execution planning must report the
missing capability rather than degrade silently to one attempt or an unbounded provider default.

## Execution Outcome And Evidence

The Operation executor needs an internal outcome envelope that relates:

1. semantic value or typed failure;
2. invocation and attempt identities;
3. selected implementation binding;
4. Resource evidence produced by that attempt;
5. retry decision and delay;
6. final exhausted/cancelled/completed outcome.

This envelope is runtime evidence, not automatically part of the Operation's business output and
not automatically disclosed to clients. A host may project, retain, aggregate, or discard it under
the execution-evidence policy shaped by plan 158. Applications that must persist reproducibility
facts need a safe invocation-scoped projection rather than a shared telemetry callback.

## First Slice

1. Declare one closed, reflected retry policy on a non-durable Operation.
2. Retry only explicitly named typed failures.
3. Preserve one invocation and correlation identity across attempts.
4. Give every attempt a unique ordinal and Resource-attempt identity.
5. Pass every attempt through existing Resource admission and evidence capture.
6. Support fixed or exponential bounded delay with cancellation.
7. Return the existing canonical Operation result after success or exhaustion.
8. Show attempts and final exhaustion in tests and Devtools evidence without exposing sensitive
   implementation details under summary disclosure.

The proof should use a provider-neutral structured computation with a deterministic fake: first
attempt fails without usage, the second produces invalid structured output, and the third succeeds.
The same policy must work for a non-model typed failure to prove that resilience is Operation
semantics rather than an LLM helper.

## Deferred Slices

1. Durable persisted retries and adapter conformance.
2. Ambiguous-effect reconciliation and provider idempotency keys.
3. Fallback to another implementation.
4. Feature-flag or A/B selection.
5. Principal, tenant, or monetary budgets.
6. Circuit breakers, bulkheads, hedging, and adaptive concurrency.
7. Redrive after terminal exhaustion.

## Acceptance Checklist

- [ ] Retry belongs to the Operation execution contract, not `ModelProvider` or one task adapter.
- [ ] One invocation can contain several separately identified attempts.
- [ ] Only declared typed failures request another attempt.
- [ ] Resource Governance independently admits and accounts for every attempt.
- [ ] Cancellation and exhaustion are distinct terminal outcomes.
- [ ] No public contract claims that retries make external effects exactly once.
- [ ] Immediate-runtime limitations are reflected and documented.
- [ ] A deterministic non-model proof exercises the same policy.
- [ ] LangGraph remains an optional adapter with no public types in the declaration.

## Non-Goals

1. Do not implement fallback or implementation selection in this plan.
2. Do not require every Operation to be durable.
3. Do not classify raw HTTP statuses in the Operation declaration.
4. Do not retry all defects, validation failures, or authorization denials by default.
5. Do not infer idempotency from a retry declaration.
6. Do not retain every attempt durably unless the host selects that evidence policy.
