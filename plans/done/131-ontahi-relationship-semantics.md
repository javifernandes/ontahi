# 131. Ontahi Relationship Semantics

Status: done

Canonical ID: `ontahi://plans/131-ontahi-relationship-semantics`

Migrated from: `bookops://plans/131-ontahi-relationship-semantics`
Original path: `plans/research/131-ontahi-relationship-semantics.md`
Source commit: `67713696`

Related plans:

1. [71a. Experimental Entity Relations Bridge](bookops://plans/71a-ontahi-relations-model-research)
2. [78. First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
3. [125. Ontahi Reference Fields](../current/125-ontahi-reference-fields.md)
4. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
5. [128a. Recursive Views And Projectable Operation Results](128a-ontahi-recursive-views-and-projectable-operation-results.md)
6. [131a. Relationship Command And Delta Core Experiment](131a-relationship-command-delta-core-experiment.md)

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

## Working Direction

The active hypothesis is **B-lite**: preserve structural relationship intent as a narrow graph
primitive without turning Relation into a smaller Domain Operation system.

```text
Relationship Command
  -> Relationship Delta
  -> Applied Outcome
```

The provisional authoring vocabulary is deliberately small:

```ts
student.course.assign(course);
student.course.clear();

course.students.add(student);
course.students.remove(student);
```

Forward and inverse authoring forms must normalize to one canonical Relation identity and command.
Relation remains responsible for topology, cardinality, nullability, target compatibility, and
structural actions. Domain Operation remains responsible for domain invariants and failures,
effects, authorization coordination, and durability.

The boundary with Association Entity remains an explicit research question rather than a settled
taxonomy. A reified N-ary relationship may reasonably be understood as a special kind of Entity;
the experiment must determine which semantics are lost or clarified by that choice. The working
criterion is that a relationship with attributes, identity, independent addressability, lifecycle,
history, policy, effects, or participation in further relationships should use the ordinary Entity
model instead of accumulating Relation options.

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

### Current Ontahi Inventory

| Surface              | Current semantics                                                                  | Consequence for 131                                                         |
| -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `RelationDefinition` | `belongsTo` or `hasMany`, typed target, optional field evidence and nullability    | topology has no canonical identity or mutation vocabulary yet               |
| Reference Field      | a required or nullable `Ref` stored as Entity data and synthesized as `belongsTo`  | direct to-one assignment can preserve intent without another stored object  |
| inverse Relation     | `hasMany` derived from a target Reference Field                                    | inverse `add/remove` must normalize through the same forward field evidence |
| `GraphCommand`       | Entity-rooted insert, upsert, update, or delete                                    | `update({ course })` executes but erases relationship intent                |
| Entity               | named fields, identity locators, Relations, Views, Operations, and runtime binding | already sufficient to model an addressable association lifecycle            |
| `TodoTag`            | explicit Entity with composite identity and two participants                       | proves an association can be created and deleted as an Entity today         |

Code evidence:

1. [`definitions.ts`](../../packages/core/src/data-graph/definitions.ts) synthesizes `belongsTo` from
   `field.ref(...)` and represents inverse topology through the target field.
2. [`command.ts`](../../packages/core/src/data-graph/command.ts) has only Entity-rooted mutations and
   no relationship-specific semantic node.
3. [`todo.ts`](../../examples/todo-express/src/todo.ts) models `TodoTag` as an Entity whose composite
   identity is `(todoId, tagId)`; assignment inserts/upserts it and removal deletes it.

This means 131 does not need a second lifecycle abstraction to prove Association Entities. It needs
one narrow structural command for direct Relations and a precise statement of how ordinary Entity
lifecycle can carry relational meaning.

### Bounded BookOps Classification

| Case                        | Current shape and pressure                                                                                                           | Classification                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `BookCollaborator`          | book/user membership plus inviter and invitation time; invite behavior validates actor, duplicates, pending state, and emits effects | Association Entity coordinated by Domain Operations                                             |
| `PendingCollaboratorInvite` | token-addressable pending state with acceptance lifecycle and authorization                                                          | Entity participating in a relationship workflow, not a direct Relation                          |
| `ReadingProgress`           | composite user/book identity, mutable progress state, timestamps, save/reset Operations                                              | Association Entity with substantial state and lifecycle                                         |
| `BookSource`                | book linkage plus provider, repository, path, synchronization cursor, and timestamps                                                 | Entity representing an external-source association                                              |
| `BookLabel`                 | book linkage plus inferred provenance and a typed target inside book structure                                                       | Association Entity; the target may later become another Ref without changing the classification |
| `NotificationDelivery`      | notification linkage plus channel, status, attempts, retry schedule, errors, and sent time                                           | lifecycle-heavy Entity whose relation is only one part of its meaning                           |

None of these cases should be compressed into Relation hooks. `BookCollaborator` and `TodoTag`
demonstrate the useful spectrum: both are association-shaped Entities, while only the former needs
substantial Domain Operation coordination.

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

Comparison outcome:

| Model           | Useful evidence                                                                                   | Boundary Ontahi should preserve                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GraphQL         | recursive selection is independent from mutation meaning                                          | Views do not define relationship writes                                                            |
| Gel             | links carry direction, cardinality, reverse traversal, constraints, and limited properties        | storage features and deletion policies do not belong wholesale in Relation                         |
| Neo4j           | a directed relationship can be typed and carry properties                                         | property-graph storage is not Ontahi's semantic ontology                                           |
| TypeDB          | Relations are first-class objects with required role players and may own attributes or play roles | Relation/Entity polymorphism is useful conceptually but does not require shared Ontahi inheritance |
| Datomic         | reference cardinality and transaction facts separate schema from applied changes                  | Relationship Delta is execution evidence, not authoring intent                                     |
| RDF/OWL + SHACL | predicates, inference, and constraints are separable layers                                       | derived facts and validation should not become writable Relation hooks                             |
| OpenFGA         | typed relationship tuples are strong policy inputs                                                | authorization evaluation remains outside 131                                                       |

Graph rewrite, event sourcing, temporal graphs, ORM nested writes, and replicated sets remain useful
future comparisons, but none is needed to choose the bounded single-runtime experiment. They become
relevant only if later work adds composition, audit history, remote conflicts, or bulk transitions.

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

## Recommendation

Adopt B-lite and keep the public taxonomy nominally small:

1. A **Relation Definition** is canonical structural topology with named endpoints, direction,
   cardinality, nullability, target compatibility, and storage-independent field evidence.
2. A **Relationship Fact** is one canonical tuple of a Relation identity and participant Refs. It
   is not necessarily an independently addressable runtime object.
3. A **Relationship Command** requests `assign`, `clear`, `add`, or `remove` against that canonical
   identity. Forward and inverse authoring forms normalize before execution.
4. A **Relationship Delta** records the facts actually added and removed after cardinality and
   current state are resolved.
5. An **Applied Outcome** carries the persisted result and generic execution evidence without
   claiming that a Domain Event occurred.
6. An **Association Entity** is an ordinary Entity whose identity and required construction input
   include the participants it associates. It uses ordinary Entity Fields, Relations, locators,
   Operations, policies, and lifecycle; it is not a special Relation with hooks.

### Association Entity Lifecycle

The relational reading of Entity lifecycle is valid and useful:

```ts
const Enrollment = entity({
  name: 'Enrollment',
  fields: {
    student: field.ref(Student),
    course: field.ref(Course),
    startedAt: field.date(),
    status: field.enum(['pending', 'active', 'completed'] as const),
  },
  locators: {
    refByStudentAndCourse: ['student', 'course'],
  },
  identity: 'refByStudentAndCourse',
});
```

`Enrollment` cannot be meaningfully constructed without at least the required `student` and
`course` role players plus every other required creation field. Deleting it removes that
association instance. Updating it evolves the association's own state. This does not require a new
`AssociationEntity` base type: it is ordinary Entity lifecycle constrained by required Ref fields,
identity, and the domain's Operations.

The polymorphism is **observational**, not an inheritance claim:

1. a direct `Student.course` edge and an `Enrollment(student, course)` instance can both project a
   relationship fact for traversal, policy input, or telemetry;
2. the direct edge changes through a Relationship Command;
3. the reified association changes through Entity creation, update, deletion, and any Domain
   Operations it owns;
4. deleting an Association Entity removes its projected relationship fact, but must not be
   rewritten as primitive `remove` when its lifecycle or effects matter.

This preserves the semantic insight without forcing `Relation extends Entity`, `Entity extends
Relation`, or a shared runtime superclass. A later reflected marker such as `role: 'association'`
may improve tooling, but 131a should first prove that structural inference from required participant
Refs and identity is insufficient before adding one.

### Boundary Rules

Use a direct Relation when all meaningful state is the existence of a binary link and its
cardinality/nullability. Use an Association Entity when any of the following is true:

1. construction requires three or more participant roles;
2. the same participants may have multiple distinct association instances;
3. the association has attributes, status, temporal validity, or history;
4. it needs independent identity, addressability, authorization, effects, or Operations;
5. it participates in other Relations.

A binary, attribute-free many-to-many edge remains a deliberate gray area. The first implementation
may model it as an explicit Entity, as `TodoTag` already does; anonymous edge storage can be added
later without changing Relationship Command semantics.

Plan 135 resolves the follow-up direction: Todo's attribute-free tagging edge becomes a direct
many-to-many Relation whose join table is storage mapping, while associations with attributes or
lifecycle remain ordinary Entities. Selection-valued endpoints and adapter conformance are required
before that decision is considered implemented.

### Structural Action Matrix

| Topology           | Authoring action     | Canonical meaning                               | Owner                                        |
| ------------------ | -------------------- | ----------------------------------------------- | -------------------------------------------- |
| nullable to-one    | `assign(target)`     | replace zero-or-one fact with one fact          | Relationship Command                         |
| nullable to-one    | `clear()`            | remove the current fact if present              | Relationship Command                         |
| required to-one    | `assign(target)`     | replace exactly one fact                        | Relationship Command                         |
| required to-one    | `clear()`            | invalid structurally                            | Relation/schema validation                   |
| inverse to-many    | `add(source)`        | same canonical fact as forward `assign(target)` | Relationship Command                         |
| inverse to-many    | `remove(source)`     | same canonical removal as forward `clear()`     | Relationship Command                         |
| derived/read-only  | any write            | invalid structurally                            | Relation/schema validation                   |
| Association Entity | create/update/delete | lifecycle of the reified association            | Entity Command and optional Domain Operation |

`replace`, bulk Selection transitions, many-to-many anonymous edges, N-ary primitive Relations, and
partial-failure semantics are deferred until the single-link normalization is proven.

## Minimal First Experiment

The first implementation after this research should be framework-level unit tests, not a complete
application and not a BookOps migration.

Use two compact domains:

1. `Student.course -> Course` with inverse `Course.students`:
   - assign one Course;
   - clear a nullable Course;
   - add and remove through the inverse;
   - prove forward and inverse authoring forms normalize to one canonical command.
2. `Student -> Enrollment -> Course`:
   - demonstrate that start date, status, or history promotes the relationship to an Entity;
   - prove the primitive does not attempt to hide that lifecycle as edge options.

The experiment should inspect the semantic command/delta and use the in-memory runtime only. It must
not implement authorization, events, HTTP, React, Explorer editing, or BookOps migration.

Todo tagging may be a secondary compatibility example, but Todo alone is not sufficient evidence.
Bulk Selection transitions are intentionally deferred until the local single-link semantics are
stable.

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

- [x] Inventory the exact current Ontahi relation/read/write/reflection surfaces from code.
- [x] Complete the state-of-the-art comparison with a layer-by-layer matrix.
- [x] Classify the bounded BookOps evidence without proposing migration work.
- [x] Define Relation Definition, Fact, Command, Delta, and Association Entity precisely enough to
      compare alternatives.
- [x] Build the cardinality/action matrix and identify which actions are structural versus domain
      behavior.
- [x] Test the B-lite hypothesis on paper with Student/Course and Enrollment.
- [x] Record the compatibility contract with recursive Views, plan 128 graph transport, and plan 78
      authorization.
- [x] Produce a recommendation, rejected alternatives, risks, and one bounded implementation plan.

## Verification

- [x] Every recommendation cites current Ontahi code or explicit external evidence.
- [x] The survey distinguishes semantic model from storage, query, policy, transport, and UI layers.
- [x] BookOps contributes concrete cases without becoming implementation scope.
- [x] Authorization is projected into plan 78 rather than solved here.
- [x] The recommended primitive does not duplicate Domain Operation lifecycle machinery.
- [x] The minimal experiment uses at least one direct Ref relation and one Association Entity.
- [x] Remaining ambiguity is explicit enough that implementation cannot silently choose a broad API.

## Decisions

1. This is research, not a blocker for 128a beyond preserving canonical Relation identity in the
   recursive View AST.
2. Authorization remains a separate plan even if relationship facts become policy inputs.
3. BookOps is evidence; any migration is a later independent plan.
4. The first implementation proof must be small Core tests over meaningful domains, not an app-wide
   rewrite.
5. B-lite is the accepted direction for the bounded Core experiment, not yet a stable public API.
6. The first implementation follow-up excludes HTTP, React, codegen, policy, Explorer, agents,
   BookOps migration, and bulk Selection transitions.
7. Association Entity is an ordinary Entity classification, not a new runtime superclass or a
   Relation with Entity lifecycle hooks.
8. Direct Relations and Association Entities are observationally polymorphic as sources of
   relationship facts, while retaining distinct mutation and lifecycle semantics.

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

## Closure

- Status: done
- Closed on: 2026-08-19
- Effective effort: ~1-2h focused research and shaping
- Outcome: B-lite accepted for a bounded Core/local experiment; Association Entity remains an
  ordinary Entity with required participant Refs and ordinary lifecycle.
- Follow-up:
  - [`131a-relationship-command-delta-core-experiment.md`](131a-relationship-command-delta-core-experiment.md)

## Evolution

- 2026-08-19: 131a, Plans 128c-e, Plan 135 slices, PostgreSQL/Supabase conformance, Todo migration,
  fluent Entity-bound Ref authoring, and the developer guide completed the B-lite proof. The open
  questions about canonical identity, Reference Field evidence, structural verbs, Selection-valued
  bulk transitions, and the direct-many-to-many/Association Entity boundary are resolved.
- Remaining work is extracted rather than added to this closed research plan:
  - [136. Relation Constraints And Eligibility Semantics](../current/136-relation-constraints-and-eligibility.md)
  - [137. Reflected Relation Affordances](./137-reflected-relation-affordances.md)
  - [138. Entity Mutation Command Authoring](./138-entity-mutation-command-authoring.md)
  - [128. Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md) owns
    remaining client execution ergonomics and generic Entity Command transport.
