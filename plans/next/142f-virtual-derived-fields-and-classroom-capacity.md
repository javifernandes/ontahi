# 142f. Virtual Derived Fields And Classroom Capacity

Status: next

Canonical ID: `ontahi://plans/142f-virtual-derived-fields-and-classroom-capacity`

Parent: [142. Declarative Model Semantics And Execution Planning](../current/142-declarative-model-semantics-and-execution-planning.md)

Predecessor: [142e. Portable Operation Condition Bridge](../done/142e-portable-operation-condition-bridge.md)

## Summary

Make derived values ordinary read-only Fields backed by portable Model Expressions, prove virtual
evaluation through authorized graph reads, and migrate Classroom from its manually maintained
`availableSeats` counter to stored `capacity` plus derived `occupiedSeats` and `availableSeats`.

## Risk To Prove

The canonical expression IR now represents Field reads, Relation aggregates, arithmetic, and
comparisons, but no Query or provider owns their evaluation. Treating a client-visible Relation
panel or partial cache as the aggregate would leak policy and return incorrect values. Treating
materialization as the authored definition would couple the model to one storage strategy.

The slice must prove that a derived Field has one reflected semantic definition, remains
unassignable, and is evaluated by the selected authorized runtime over the complete permitted graph
dependency. PostgreSQL and in-memory execution must agree without introducing permanent Relation
invariant enforcement yet.

## First Vertical Slice

1. Add `field.derived(...)` as a read-only Field declaration compiled into canonical Model
   Expression IR from real Entity Field and Relation symbols.
2. Reflect dependencies and preserve derived Fields through Views, Queries, JSON Schema where
   appropriate, codegen, and Explorer without exposing an assignment surface.
3. Evaluate virtual derived Fields in memory and PostgreSQL through existing Query/View and
   graph-read policy boundaries.
4. Append the Classroom capacity migration described by Plan 142: backfill `capacity`, validate
   legacy state, and remove the private stored `available_seats` counter.
5. Declare `occupiedSeats = students.count()` and
   `availableSeats = capacity - students.count()` once on Course, then remove manual counter
   updates from `Student.transfer`.

## Non-Goals

1. No automatic materialization, triggers, rebuilds, drift detection, or repair daemon.
2. No permanent aggregate Relation invariant or capacity enforcement in this slice.
3. No client-cache aggregate inference and no authorization logic duplicated in Field evaluation.
4. No generic remote Entity Command or Explorer mutation UI.
5. No rewrite of Classroom migration `001`; the upgrade remains append-only and transactional.

## Acceptance Checklist

- [ ] Derived values are declared under `fields` and Commands cannot assign them.
- [ ] Natural authoring and the explicit builder produce the same canonical IR with source-located
      diagnostics.
- [ ] Reflection exposes the Field definition and exact dependencies without a provider strategy.
- [ ] Authorized in-memory and PostgreSQL Views return identical virtual values.
- [ ] Missing or unauthorized aggregate evidence is unavailable/unknown rather than a partial
      count.
- [ ] Classroom upgrade and fresh-install fixtures prove the `capacity` migration.
- [ ] `Student.transfer` contains no manual available-seat update while preserving its current
      transactional behavior.
- [ ] Focused tests, typecheck, lint, build, generated-artifact checks, Changeset, Plan, Atlas, and
      developer documentation are complete.
