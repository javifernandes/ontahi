---
id: ontahi.model.semantic-module
kind: concept
title: Semantic Module
parent: ontahi.model
status: shaping
horizon: later
supports:
  - ontahi.model.application
  - ontahi.model.entity
  - ontahi.model.domain-operation
  - ontahi.model.event
  - ontahi.model.semantic-program-kernel
relatedPlans:
  - ontahi://plans/160-semantic-modules-composition-and-system-boundaries
  - ontahi://plans/71c-ontahi-application-module-composition
  - ontahi://plans/142h-distributed-execution-topologies
  - ontahi://plans/154-semantic-program-kernel-and-distributed-evaluation
---

A [[ontahi.model.semantic-module|Semantic Module]] is a named, composable contribution to an
[[ontahi.model.application|Application]] graph. It may introduce Entities, Relations, Operations,
Events, Interactions, Values, and attributed extensions; declare dependencies on contributions
owned by other Modules; and retain provenance through reflection and execution.

A Module is not a folder, source package, service, runtime, graph partition, or deployment unit.
Those forms may align with Module boundaries, but the semantic composition survives when code is
rebundled or execution moves. A subgraph is one possible projection of a Module or runtime
placement, not the definition of Module ownership.

Modules integrate through several links whose meanings remain distinct:

1. Relations connect Entity identities and domain structure;
2. direct Operation invocation requests contracted work and observes a result or failure;
3. Events announce facts and admit zero or more asynchronous consumers;
4. named extensions contribute one concern's perspective or capability over an existing identity.

No one link is the universal modularity mechanism. In particular, Events do not replace direct
collaboration where request/result semantics are intended, and direct imports do not replace facts
whose producers should not know their consumers.

The owning Module of an Entity retains its identity and base lifecycle. Another Module may relate
to that Entity or contribute a named extension only through explicit composition. Extension
provenance, collisions, optionality, and absence must be inspectable; “extension” must not become
permission to reopen and mutate another declaration invisibly.

Module composition precedes execution topology. One Application may evaluate every Module in one
process, route one Module's Operations through Runtime Protocol, deliver another Module's Events
asynchronously, or resolve Relations across graph segments. Those are bindings and placement
decisions over the same semantic identities, not different domain programs.

The completed Plan 71c used entity modules as a two-phase compatibility protocol while establishing
`ontahi()` as the single composition root. That implementation is narrower and remains historical.
The Semantic Module described here groups and composes several semantic subjects; it must not be
introduced as an alias for `entityModule(...)`.
