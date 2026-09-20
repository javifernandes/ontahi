# 153b. Declarative Operation Context Scope

Status: backlog

Canonical ID: `ontahi://plans/153b-declarative-operation-context-scope`

Shapes: [Model-Backed Operation Execution](../../atlas/items/model/model-backed-operation-execution.md),
[Intent Resolution](../../atlas/items/model/intent-resolution.md).

## Summary

Use evidence from [spike 153](../next/153-model-backed-todo-command-spike.md) to investigate whether
an operation can declare the relevant graph scope from its typed inputs instead of hand-authoring
every context fetch. Schema describes the ontology; authorized instances resolve concrete targets.
Scope describes relevance and never grants authority.

## Scope And Execution Slices

1. Inventory the spike's actual context builders and distinguish input refs, relation traversal,
   candidate selection, projected fields, and ambient UI context.
2. Compare composition of existing Refs, Selections, Queries, and Views before inventing syntax.
3. Prototype one bounded declaration and its authorized runtime materialization; preserve a manual
   escape hatch. Define size limits, truncation/completeness, provenance, freshness, and cost limits.
4. Compare manual and declarative context for the same cases and record whether a public abstraction
   is justified. Coordinate disclosure constraints with plan 153a.

## Acceptance And Verification

- [ ] One Todo context can be described and materialized without duplicating graph semantics.
- [ ] Runtime authority intersects scope before context reaches the provider.
- [ ] Incomplete candidate sets cannot silently establish unique intent resolution.
- [ ] Source refs, projection, and freshness are traceable without requiring raw sensitive logs.
- [ ] Evidence justifies either a minimal reusable declaration or retaining explicit context builders.

## Non-Goals And Closure

No autonomous query planning, whole-graph dumping, retrieval platform, or required dependency for
spike 153. Model-provider transport does not own graph fetching. Close with an evidence-backed
boundary and, only if warranted, a narrowly scoped implementation plan and Atlas concept.
