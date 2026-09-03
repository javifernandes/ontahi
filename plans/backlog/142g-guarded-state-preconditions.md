# 142g. Guarded State Preconditions

Status: backlog

Canonical ID: `ontahi://plans/142g-guarded-state-preconditions`

Source plan: [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)

## Summary

Lower portable state-dependent Operation preconditions into one guarded Data Graph Command when the
provider can preserve their semantics. Require an explicit atomic Operation boundary when it
cannot.

## Scope

1. Identify the smallest Model Expression subset that can become a guarded Command predicate.
2. Define diagnostics explaining why an expression cannot be lowered safely.
3. Preserve canonical rejection meaning across lowered and Operation-atomic evaluation.
4. Prove one in-memory and one provider-backed state precondition without a time-of-check/time-of-use
   gap.

## Non-Goals

1. Do not treat arbitrary Operation callbacks as portable predicates.
2. Do not make client preflight authoritative.
3. Do not absorb permanent Entity invariants, which must cover every mutation path.

## Acceptance Checklist

- [ ] One state-dependent precondition lowers to an atomic guarded Command.
- [ ] Unsupported lowering produces an actionable reason and requires an atomic Operation.
- [ ] Both paths preserve the same reflected condition and rejection identity.
- [ ] Provider-backed concurrency evidence rules out a check-then-write race.
