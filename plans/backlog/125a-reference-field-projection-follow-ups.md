# 125a. Reference Field Projection Follow-Ups

Status: backlog

Canonical ID: `ontahi://plans/125a-reference-field-projection-follow-ups`

Source plan: [125. Ontahi Reference Fields](../done/125-ontahi-reference-fields.md)

## Summary

Finish the remaining framework projections around the established Reference Field model without
reopening its core semantic and adapter work.

## Scope

1. Present reflected target Entity and locator meaning in Explorer where it materially improves
   Reference Field authoring or inspection.
2. Project deferred or cyclic Reference Fields through browser codegen without declaration-order or
   temporal-dead-zone failures.
3. Replace the Todo example's legacy scalar-FK `TodoTag` declaration when the anonymous
   many-to-many representation is an honest fit.

## Non-Goals

1. Do not make BookOps application migration a framework completion requirement.
2. Do not change the established semantic Ref value or provider mappings without new evidence.
3. Do not hide cross-graph routing inside ordinary storage mappings.

## Acceptance Checklist

- [ ] Explorer presents Reference Field target and locator semantics from canonical reflection.
- [ ] Deferred/cyclic Reference Fields generate browser-safe code without order-dependent failures.
- [ ] The Todo example no longer needs its legacy scalar-FK join declaration, or records why the
      explicit mapping remains semantically necessary.
