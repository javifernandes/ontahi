# 142a. Existing Operation Contract Compatibility Baseline

Status: done

Canonical ID: `ontahi://plans/142a-existing-operation-contract-compatibility-baseline`

Parent: [142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md)

## Summary

Turn the existing code-bearing Operation `contracts.pre` / `contracts.post` behavior into an
executable compatibility baseline and choose its explicit alpha evolution before Ontahí publishes
portable declarative conditions. Keep this slice observational: no expression language, reflected
condition IR, automatic transaction planning, or Classroom model migration yet.

## Risk To Prove

The current callback surface is exported and documented but used by no executable repository
application. Its low-level breadth can be mistaken for the future declarative contract model even
though callbacks are opaque, receive runtime internals, and cannot participate honestly in
reflection or advisory execution. Adding portable conditions as a union beside that form could
leave two meanings under one property and make callback-versus-declaration behavior dependent on
shape tests.

## Scope

1. Add Domain Operation-level semantic tests for ordered synchronous, Promise, and Effect checks;
   first-failure behavior; and successful-result unwrapping.
2. Characterize schema-native Ref inputs at each phase: contract callbacks receive the normalized
   portable Ref while the body receives its runtime-bound `resolve` / `invalidate` / `refresh`
   facade.
3. Prove pre, body, and post share the ordinary Operation UnitOfWork and resource map.
4. Prove a post-check failure is an ordinary expected Operation failure after body effects and does
   not imply rollback.
5. Prove an explicit `app.graph.transaction(effect)` commits before the current post callback runs,
   restores the parent UnitOfWork, and cannot be undone by a later post-check failure.
6. Audit repository adoption and record one compatibility decision plus its future migration path.

## Non-Goals

1. No new portable condition authoring shape or expression IR.
2. No `operation.atomic(...)`, runtime capability planner, or implicit transaction.
3. No change to existing callback runtime behavior in this characterization slice.
4. No derived Field, aggregate invariant, advisory client evaluation, or Classroom migration.
5. No parallel `preconditions` / `postconditions` namespace.

## Decision To Validate

Preserve `contract({...})` as an explicit server-only Layer Concern escape hatch for opaque
callbacks. Deprecate and later remove the callback-valued top-level Operation `contracts` property
during the alpha, so Plan 142 can reuse the existing semantic `contracts.pre` / `contracts.post`
categories for one portable declarative model without a callback/object union. The removal slice
must carry a public Changeset and migrate the developer example; 142a records evidence only and
does not change the shipped type or runtime.

## Acceptance Checklist

- [x] Domain Operation tests cover check ordering and first-failure semantics at the public runner.
- [x] Tests prove contract callbacks receive portable input while the body receives hydrated Refs.
- [x] Tests prove pre, body, and post observe one ordinary UnitOfWork and resource scope.
- [x] Tests prove post failure preserves already-applied body mutation.
- [x] Tests prove an explicit Data Graph transaction commits before post evaluation and restores the
      parent UnitOfWork.
- [x] Repository adoption evidence distinguishes the top-level property from the reusable
      `contract(...)` concern.
- [x] Plan 142, Atlas, and developer documentation record the compatibility decision and avoid
      presenting callback contracts as the future declarative form.
- [x] Focused Core tests, typecheck, lint, build, format, and an empty package Changeset pass.

## Split Point

Stop after the old behavior and migration decision are durable. The next slice is the private
language/IR experiment over Classroom expressions; it must not publish a new public DSL. Actual
top-level callback removal belongs with the declarative contract replacement so consumers receive
one migration rather than an unusable gap.

## Delivery

The colocated Domain Operation suite now fixes the existing callback boundary at the public raw
runner. It proves ordered sync, Promise, and Effect callbacks; first-failure short-circuiting and
successful payload unwrapping; portable Ref inputs in callbacks versus the body's hydrated
`resolve` / `invalidate` / `refresh` facade; shared ordinary UnitOfWork resources; and the absence
of rollback for post failures. A separate transaction case proves that the body runs in a child
UnitOfWork, commits, restores the parent, and only then enters the current post callback.

Repository adoption remains limited to tests and developer documentation. The durable alpha
decision therefore keeps callback-valued top-level `contracts` compatible until its portable
replacement exists, preserves `contract(...)` as the explicit opaque server-only concern, and
reserves `contracts.pre` / `contracts.post` for one future reflected declarative model. The
developer guide now directs new opaque checks to `app.validation.contract(...)`; Atlas and Plan
142 record the same migration boundary. No runtime or public type changed, so the slice carries an
empty Changeset.

## Verification

1. The focused Domain Operation contract suite passed all five semantic cases.
2. Core passed all 610 tests across 88 files.
3. Core typecheck, lint, and build passed.
4. Targeted formatting, `git diff --check`, and Changesets status passed; Changesets reported no
   package bump for the empty test-and-documentation entry.
