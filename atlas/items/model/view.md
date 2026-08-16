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

A View is caller-owned, analogous to a GraphQL query document or selection set. Its name identifies
the document for reflection, transport, and cache identity, but it does not enter the server
application's Entity/Value namespace. Different clients may define different Views with the same
name without changing the server schema.

Browser code authors Views against the generated client Entity facade and sends only the canonical
AST through `.as(view)`. The server rebuilds and validates that AST against the Entity declared by
the Operation's Selection output, then composes one final Query. A future persisted or approved View
catalog would be an optional client/deployment artifact rather than part of the Entity schema.
