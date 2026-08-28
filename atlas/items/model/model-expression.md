---
id: ontahi.model.model-expression
kind: concept
title: Model Expression
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.model.field
  - ontahi.model.relation
  - ontahi.model.domain-operation
  - ontahi.operation-contracts
relatedPlans:
  - ontahi://plans/142-declarative-model-semantics-and-execution-planning
  - ontahi://plans/142b-classroom-model-expression-language-experiment
  - ontahi://plans/142e-portable-operation-condition-bridge
---

A Model Expression is portable, JSON-safe semantic data for calculations and conditions rooted in
known Ontahí model symbols. It is not a serialized JavaScript callback and it does not carry
provider, runtime, authority, or policy objects. Derived Fields, Operation conditions, and permanent
invariants may eventually share this expression vocabulary while keeping their different lifecycle
and enforcement boundaries.

Plan 142b proved a private versioned IR for the smallest Classroom vocabulary: Field reads,
Operation input Refs, Relation `count()`, subtraction, less-than-or-equal, Ref identity, and boolean
not. The same complete IR was produced by two frontends:

1. a build-time TypeScript AST analyzer over natural expression-bodied callbacks;
2. an explicit runtime builder for applications where source text is unavailable.

The natural TypeScript form is preferred for ordinary application authoring because it retains
familiar arithmetic and boolean syntax. The explicit builder is required for runtime-only parity,
not a second semantic language. Both must fail closed for unsupported nodes, and neither may execute
or serialize arbitrary author code.

Plan 142e promoted the IR to technology-independent Core. Codegen derives Operation input Ref
symbols from the actual schema, compiles named expression-bodied `contracts.pre` callbacks without
executing them, and emits one condition registry consumed by both the authority and generated
clients. Unsupported syntax carries stable source locations. A runtime-only application can use
the explicit `modelExpression` builder to produce the same IR.

The first production consumer is a pure Operation input condition. Its reflected metadata includes
a stable condition id, dependencies, and conventional rejection. Evaluation is tri-state:
`satisfied`, `rejected`, or `unknown` when a dependency is unavailable. Client evaluation is only
advisory; the selected authority evaluates the same IR again before the Operation body.

The broader IR nodes for Field reads, Relation `count()`, arithmetic, and comparison are now public
Core vocabulary but do not yet imply a read strategy. Derived Fields and permanent Relation
invariants remain separate lifecycle consumers that must prove their own dependency discovery,
authorization, provider lowering, and enforcement boundaries.
