---
id: ontahi.model.model-expression
kind: concept
title: Model Expression
parent: ontahi.model
status: shaping
horizon: now
supports:
  - ontahi.model.field
  - ontahi.model.relation
  - ontahi.model.domain-operation
  - ontahi.operation-contracts
relatedPlans:
  - ontahi://plans/142-declarative-model-semantics-and-execution-planning
  - ontahi://plans/142b-classroom-model-expression-language-experiment
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

The IR is not yet a public Core surface. The experiment supplied a compiler-owned semantic symbol
table as fixture evidence. Publication requires codegen to derive that table from actual Entity
Fields, Relations, and Operation input Refs, and requires Core to own the canonical IR independently
from TypeScript ASTs. Reflection and runtimes consume only that IR; static analysis remains an
optional authoring frontend.
