---
id: ontahi.model.view
kind: concept
title: View
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model
  - ontahi.application-architecture-surface.data-graph-execution-routing
relatedPlans:
  - ontahi://plans/128a-recursive-views-and-projectable-operation-results
  - ontahi://plans/133-nominal-model-registry-and-codegen-reuse
---

A View is a named, finite, recursively nested materialization shape over an Entity graph. A field
leaf preserves the ordinary Entity value, including a Ref. A nested Relation node explicitly
traverses and materializes the related Entity while preserving canonical relation identity,
direction, target, cardinality, and nullability.

Views are typed semantic values with a versioned JSON-safe AST. They shape Queries and Selections,
and they may shape Selection-producing Operations without changing the population selected by the
Operation.

A View's name is application-level nominal identity. Reusing one declaration is distinct from
declaring another structurally equal View with the same name.
