# 131. Ontahi Relationship Semantics

Status: research

Canonical ID: `ontahi://plans/131-ontahi-relationship-semantics`

Migrated from: `bookops://plans/131-ontahi-relationship-semantics`
Original path: `plans/research/131-ontahi-relationship-semantics.md`
Source commit: `67713696`

Related plans:

1. [71a. Experimental Entity Relations Bridge](bookops://plans/71a-ontahi-relations-model-research)
2. [78. First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
3. [125. Ontahi Reference Fields](../current/125-ontahi-reference-fields.md)
4. [128. Ontahi Data Graph Execution Bridge](../next/128-ontahi-data-graph-execution-bridge.md)
5. [128a. Recursive Views And Projectable Operation Results](../done/128a-ontahi-recursive-views-and-projectable-operation-results.md)

## Summary

Research the minimum semantic model Ontahi needs to describe not only how Entities are related, but
how relationship facts may be traversed, changed, constrained, observed, and composed by Domain
Operations without turning every Relation declaration into a new subsystem.

This is a model and state-of-the-art investigation, not an implementation plan. It must distinguish
semantic model, runtime execution, storage representation, transport representation, authorization,
and UI affordance before proposing a public API.

## Context

Today a Relation names graph topology. A Reference Field stores a typed Ref and synthesizes a
`belongsTo` Relation; an inverse Relation enables to-many traversal; relation-root reads navigate
between Selections. Generic Commands can update the Reference Field, but a patch such as
`student.update({ course })` no longer preserves that the application requested an assignment of
`Student.course`.

That missing distinction matters once Commands cross runtime boundaries or become available to
Explorer, CLI, agents, policy, telemetry, and generated UI. At the same time, BookOps shows that rich
relationships often already deserve Association Entities and Domain Operations. `BookCollaborator`,
`PendingCollaboratorInvite`, `ReadingProgress`, `BookSource`, `BookLabel`, and
`NotificationDelivery` should not be collapsed into magical edge hooks.

The research must therefore find a small semantic center rather than accumulating authorization,
events, transactions, retries, and lifecycle callbacks as Relation options.

## Current Ontahi Model

The starting taxonomy is:

1. **Relation Definition**: named typed topology between Entity definitions.
2. **Relationship Fact**: one concrete link between Entity instances.
3. **Relation Traversal**: a Query/View path that materializes related Entities.
4. **Relationship Command**: a requested structural change such as assign, clear, add, or remove.
5. **Relationship Delta**: the resolved links actually added and removed.
6. **Domain Operation**: named intent, invariants, contracts, effects, and domain failure semantics.
7. **Association Entity**: a relationship with identity, attributes, lifecycle, history, policy, or
   independently meaningful behavior.

These concepts are hypotheses to test, not a settled API.

## Research / Evidence

### Existing Ontahi And BookOps Evidence

The research should inspect current Core, Todo, and representative BookOps cases, but must not turn
the evidence audit into a BookOps migration project.

Bounded BookOps evidence set:

1. `BookCollaborators` as a relation-like Operation namespace over `BookCollaborator` and pending
   invitations.
2. `BookCollaborator` as an Association Entity with actor and invitation history.
3. `ReadingProgress` as a stateful User/Book association with composite identity.
4. `BookSource` and `BookLabel` as relationships carrying provider, provenance, or target metadata.
5. `NotificationDelivery` as a lifecycle-heavy association that clearly remains an Entity.

For each case record current representation, actual behaviors, policy pressure, effects, and whether
a smaller framework primitive would remove accidental code without erasing the Entity lifecycle.

### State Of The Art Survey

The first scan shows complementary ideas rather than one ready-made model:

1. [GraphQL selection sets](https://spec.graphql.org/September2025/#sec-Selection-Sets) let callers
   request exact recursively nested shapes, but mutations remain schema/domain-specific.
2. [Gel links](https://docs.geldata.com/reference/datamodel/links) combine direction, cardinality,
   reverse traversal, link properties, constraints, and deletion behavior; Gel also provides
   [object access policies](https://docs.geldata.com/reference/datamodel/access_policies).
3. [Neo4j property graphs](https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/)
   reify typed directed relationships with properties, while the Neo4j GraphQL layer exposes
   relationship direction and property projections.
4. [TypeDB's PERA model](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)
   treats Relation types, instances, named roles, role players, attributes, subtyping, and
   cardinality as schema concepts.
5. [Datomic schema](https://docs.datomic.com/schema/schema-reference.html) models reference
   attributes with one/many cardinality and represents change through transaction facts, offering a
   useful comparison for Relationship Facts, deltas, and history.
6. [RDF/OWL](https://www.w3.org/TR/owl2-syntax/) and
   [SHACL](https://www.w3.org/TR/shacl/) separate graph predicates, inference, and reusable graph
   constraints from application behavior.
7. [OpenFGA](https://openfga.dev/docs/concepts) models authorization through typed relationship
   tuples and derived relationships, but intentionally does not provide general domain lifecycle.

The deeper research should also cover:

1. graph rewrite systems and typed graph transformation;
2. DDD aggregates, association objects, and domain events;
3. event-sourced relationship changes and temporal graphs;
4. nested-write and relation APIs in ORMs as ergonomics evidence and an abstraction warning;
5. CRDT/replicated relationship sets only as a future conflict-resolution comparison;
6. how systems distinguish proposed change, applied delta, and emitted fact/event.

The goal is not feature collection. For every system, record what layer owns semantics, what is only
storage/query syntax, and which ideas survive provider-independent application modeling.

## Relationship Taxonomy

The investigation must classify at least:

1. scalar/value fields that are not relationships;
2. stored required and nullable Reference relationships;
3. inverse to-many relationships;
4. one-to-one, many-to-one, one-to-many, and many-to-many topology;
5. symmetric versus directional relationships and named endpoint roles;
6. derived/read-only relationships;
7. cross-resource or cross-graph relationships;
8. Association Entities;
9. temporal relationships and whether they naturally become Association Entities;
10. higher-arity relations that cannot be represented honestly as one binary edge.

## Relationship Operations

Build a semantic matrix rather than copying an ORM API:

1. read, traverse, project, filter, count, and contains;
2. to-one assign, replace, clear, and move;
3. inverse to-many add, remove, replace, and clear;
4. bulk transitions over a Selection;
5. association create/delete/update through an Entity lifecycle;
6. derived relationships that are not directly writable.

For each candidate determine:

1. whether it is a semantic graph primitive or storage sugar;
2. whether inverse authoring forms normalize to the same canonical command;
3. whether it can be expressed without reading previous state;
4. whether it needs a resolved previous/next delta;
5. whether it belongs in Core, a Domain Operation, or an Association Entity.

## Relationship Transitions

Test a staged model rather than one overloaded transition object:

```text
Relationship Command
  requested structural change

Relationship Delta
  resolved facts added and removed

Applied Outcome
  persisted result plus generic execution evidence
```

Questions:

1. Is a Relationship Command a distinct graph program or a semantic specialization of GraphCommand?
2. Must `student.course.assign(course)` and `course.students.add(student)` compile to one canonical
   Relation identity and command?
3. Can storage return previous and next facts portably without forcing a pre-read?
4. Which generic telemetry is safe to emit automatically, and which facts remain explicit Domain
   Events owned by Operations?

## Authorization Boundary

Plan 78 remains the owner of authorization implementation. This research only defines the semantic
inputs that a future policy could consume:

```text
Principal + relationship action + subjects + targets + context + resource state -> decision
```

The study should determine whether read, traverse, assign, clear, add, and remove are stable action
vocabulary and how a Relationship Command composes with Operation authorization without duplicating
policy. It must not select CASL, OpenFGA, Cedar, RLS, or another evaluator here, migrate BookOps
permissions, or weaken authoritative storage policy.

## Effects And Lifecycle Boundary

Do not add ORM-style `beforeAssign` or `afterUpdate` hooks as an assumed design.

Provisional separation:

1. structural cardinality, nullability, and target compatibility belong to Relation/schema;
2. generic execution telemetry may observe a canonical Relationship Command or Delta;
3. domain invariants, failures, notifications, and domain events remain in Domain Operations;
4. asynchronous or durable follow-up behavior reuses Operation/effect/workflow machinery;
5. a relationship requiring independent lifecycle becomes an Association Entity.

The research must actively try to falsify this split.

## Association Entity Boundary

A relationship is a strong Entity candidate when it has one or more of:

1. independent identity or addressability;
2. attributes beyond structural linkage;
3. meaningful lifecycle or status;
4. temporal validity or history;
5. independent authorization;
6. operations and failure semantics of its own;
7. effects or external synchronization;
8. participation in further relationships.

Compare direct `Student.course` with `Enrollment`, and direct tagging with `TodoTag`. Determine
whether many-to-many relationships without metadata remain explicit Association Entities in the
first implementation or justify anonymous edge storage later.

## Possible Semantic Models

### Alternative A: Relations Stay Metadata

Relations describe topology and traversal only. Every mutation remains an Entity Command or Domain
Operation.

Strength: smallest framework surface. Risk: direct graph Commands, Explorer, agents, and policy lose
the meaning of changing a Ref.

### Alternative B: Relationship Commands Become Graph Primitives

Relations expose structural actions that compile to a canonical semantic command before storage
lowering. Domain Operations compose those primitives for intent, invariants, and effects.

Strength: preserves meaning across runtimes. Risk: can grow into a parallel operation/lifecycle
framework if the primitive is not kept narrow.

### Alternative C: Relationship Operations Are Generated Domain Operations

Ontahi derives named Operations such as assign/add/remove from Relation metadata rather than adding
a separate command kind.

Strength: reuses invocation, contracts, policy, and effect machinery. Risk: operation proliferation
and confusion between generic graph transformation and named domain behavior.

### Provisional Direction: B-Lite

Investigate a narrow Relationship Command/Delta intermediate representation. Keep behavior,
authorization evaluation, effects, retries, and durability in existing machinery. Treat the result
as provisional until the minimal experiment demonstrates that semantic preservation is worth the
extra graph primitive.

## Minimal First Experiment

The first implementation after this research should be framework-level unit tests, not a complete
application and not a BookOps migration.

Use two compact domains:

1. `Student.course -> Course` with inverse `Course.students`:
   - assign one Course;
   - clear a nullable Course;
   - bulk assign a Student Selection;
   - prove forward `assign` and inverse `add` normalize to one command.
2. `Student -> Enrollment -> Course`:
   - demonstrate that start date, status, or history promotes the relationship to an Entity;
   - prove the primitive does not attempt to hide that lifecycle as edge options.

The experiment should inspect the semantic command/delta and use the in-memory runtime only. It must
not implement authorization, events, HTTP, React, Explorer editing, or BookOps migration.

Todo tagging may be a secondary compatibility example, but Todo alone is not sufficient evidence.

## Scope

1. Inspect current Core relation, Ref, Selection, Query, Command, Operation, requirement, concern,
   effect, Explorer, and Todo surfaces.
2. Perform the comparative state-of-the-art survey above using primary sources.
3. Build the relationship and operation taxonomies.
4. Audit the bounded BookOps evidence set.
5. Compare at least Alternatives A, B, and C.
6. Specify the minimal experiment and follow-up boundaries.

## Non-Goals

1. Do not implement framework code in this research plan.
2. Do not solve authorization or absorb plan 78.
3. Do not migrate or redesign BookOps.
4. Do not add Relation lifecycle hooks, transactions, events, retries, or durability options.
5. Do not require a complete Todo, Trip, or Student application.
6. Do not choose a storage representation or graph database model as Ontahi's ontology.
7. Do not design the future textual GraphQL-like language.

## Research Slices

- [ ] Inventory the exact current Ontahi relation/read/write/reflection surfaces from code.
- [ ] Complete the state-of-the-art comparison with a layer-by-layer matrix.
- [ ] Classify the bounded BookOps evidence without proposing migration work.
- [ ] Define Relation Definition, Fact, Command, Delta, and Association Entity precisely enough to
      compare alternatives.
- [ ] Build the cardinality/action matrix and identify which actions are structural versus domain
      behavior.
- [ ] Test the B-lite hypothesis on paper with Student/Course and Enrollment.
- [ ] Record the compatibility contract with recursive Views, plan 128 graph transport, and plan 78
      authorization.
- [ ] Produce a recommendation, rejected alternatives, risks, and one bounded implementation plan.

## Verification

- [ ] Every recommendation cites current Ontahi code or explicit external evidence.
- [ ] The survey distinguishes semantic model from storage, query, policy, transport, and UI layers.
- [ ] BookOps contributes concrete cases without becoming implementation scope.
- [ ] Authorization is projected into plan 78 rather than solved here.
- [ ] The recommended primitive does not duplicate Domain Operation lifecycle machinery.
- [ ] The minimal experiment uses at least one direct Ref relation and one Association Entity.
- [ ] Remaining ambiguity is explicit enough that implementation cannot silently choose a broad API.

## Decisions

1. This is research, not a blocker for 128a beyond preserving canonical Relation identity in the
   recursive View AST.
2. Authorization remains a separate plan even if relationship facts become policy inputs.
3. BookOps is evidence; any migration is a later independent plan.
4. The first implementation proof must be small Core tests over meaningful domains, not an app-wide
   rewrite.

## Open Questions

1. Is a Relation Definition one directed endpoint declaration or a canonical edge with named roles
   and inverse projections?
2. Does a direct Reference Field contain all necessary Relation semantics for the common case?
3. Which structural actions deserve first-class commands?
4. Is previous/next state necessary for every transition or only for resolved deltas and effects?
5. How do bulk transitions preserve cardinality, partial failure, and affected-row limits?
6. When should an edge with properties remain a Relation versus become an Association Entity?
7. Can policy and Explorer affordances consume the same reflected action vocabulary?
8. How are derived and cross-graph relationships represented without pretending they are locally
   writable?

## Closure / Evolution

This research closes when it yields a defensible semantic recommendation and one bounded Core
experiment. Likely follow-ups are:

1. Relationship Command/Delta Core experiment;
2. relationship action integration under plan 78;
3. Explorer and agent affordances after policy exists;
4. a separate BookOps evidence migration if the primitive proves useful;
5. event/audit/durable evolution only after applied deltas have a stable meaning.
