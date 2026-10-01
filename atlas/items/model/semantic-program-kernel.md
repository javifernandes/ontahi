---
id: ontahi.model.semantic-program-kernel
kind: concept
title: Semantic Program Kernel
parent: ontahi.model
status: shaping
horizon: later
supports:
  - ontahi.model.query
  - ontahi.model.command
  - ontahi.model.domain-operation
  - ontahi.model.durable-operation
  - ontahi.model.operation-interaction
  - ontahi.durable-workflows
  - ontahi.runtime-protocol
relatedPlans:
  - ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation
---

The Semantic Program Kernel is the shaping hypothesis that Ontahí Reads, Commands, Operation
Invocations, durable waits, and observations are projections of a smaller typed evaluation model.
A semantic program may be partially bound, completed through typed substitution, evaluated where
the required capability lives, suspended for an event or Interaction, and observed as a live value
across runtime boundaries.

Existing canonical requests remain the executable wire forms for closed programs. The kernel does
not replace their authority, policy, validation, consistency, or lifecycle boundaries. A runtime
evaluates only the terms for which it owns declared capabilities and may delegate unresolved work
without treating transport or provider formats as semantic truth.

The hypothesis also separates addressable participants from the programs they evaluate. An
Assistant may contribute grounding, presentation, provider selection, context, and execution
strategy; a Session relates participants over time; each requested or autonomous unit of work has
its own inspectable Program Run. None of those identities grants authority by itself.

This item records a research direction rather than an accepted universal AST or public TypeScript
API. Plan 154 owns the incremental proofs for typed holes, substitution, Reads and Commands,
reactive evaluation, durable waits, distributed evaluation, Assistants, Sessions, and tooling. The
item may be narrowed, split, or removed as those proofs produce evidence.
