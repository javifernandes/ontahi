# 71. Ontahi / BookOps Semantic Model Convergence

Status: done

Canonical ID: `ontahi://plans/71-ontahi-bookops-semantic-model-convergence`

Migrated from: `bookops://plans/71-ontahi-bookops-semantic-model-convergence`
Original path: `plans/done/71-ontahi-bookops-semantic-model-convergence.md`
Source commit: `4b86f3c6`

Related plans:

1. [56 Entity Companions And Application Methods](bookops://plans/56-entity-companions-and-application-methods)
2. [59 Authority-Scoped Domain Operations Over The Data Graph](bookops://plans/59-authority-scoped-domain-operations-over-the-data-graph)
3. [65 Relation-Root Navigation Over Entity Relationships](bookops://plans/65-relation-root-navigation-over-entity-relationships)
4. [68b Data Graph Engine API](bookops://plans/68b-data-graph-engine-api)
5. [68j Graph Execution Authority API](bookops://plans/68j-graph-execution-authority-api)
6. [70 First-Class Durable Tasks In Architecture](bookops://plans/70-first-class-workflow-tier-in-architecture)
7. [77 Domain Topology And GraphOS Layers](ontahi://plans/77-domain-topology-and-graphos-layers)
8. [78 First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
9. [100 Ontahi Framework Extraction](./100-ontahi-framework-extraction.md)
10. [120 Ontahi Environment Resources And Semantic Bindings](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)

## Summary

Use BookOps as a semantic pressure test for Ontahi's new unified application and entity
declarations.

This is not initially a migration plan. It is a sequence of research decisions that must determine
which BookOps concepts belong in Ontahi, which are accidental implementation patterns, which should
be absorbed into stronger abstractions, and which should disappear.

The Todo portability example proved a compact base:

```ts
const Todo = entity({
  name: 'Todo',
  fields: { ... },
  locators: { ... },
  identity: 'refById',
  operations: ({ self, commands, operation }) => ({ ... }),
});
```

BookOps must not be forced into that exact v0 shape. Its real entities, relations, read models,
operations, policies, tasks, codegen, Supabase runtime, and application capabilities should refine
the model before broad migration begins.

## Context

BookOps currently expresses one conceptual graph through several stacked surfaces:

1. entity schemas in `web/src/data/graph/schema.ts`,
2. bound selections and patched companion methods in `web/src/data/graph/entities.ts`,
3. domain operations in feature-owned `entity.ts` modules,
4. graph API registration in `web/src/data/graph/api.ts`,
5. architecture capabilities in `web/src/architecture.ts`,
6. Supabase execution and reflected readers in separate runtime modules,
7. generated browser, task, and Vercel Workflow artifacts.

The current inventory includes:

1. 17 primary persisted entity declarations,
2. 5 relation-enriched variants,
3. 4 Reader-specific entity/read-model declarations,
4. 21 registered graph API entries,
5. 63 registered domain operations according to the graph API contract test,
6. browser-direct graph operations on `ReadingProgress`,
7. durable operations and generated workflow artifacts,
8. at least 10 companion objects assembled with `Object.assign(...)`.

These are evidence of required capabilities, not a specification for the final API.

### Why The Old Plan Was Reshaped

The previous version of plan 71 assumed that "entity-owned actions" and removal of companion
patching were already the target solution.

That direction was useful but premature. The extraction work and Todo example revealed a deeper
question:

> What are the actual semantic concepts, and which historical Ontahi/BookOps distinctions were only
> scaffolding needed to reach them?

In particular:

1. `Object.assign(...)` companions are mechanically useful but conceptually weak.
2. The split between graph operations and domain operations may encode real axes, but the two-type
   taxonomy may be a compromise rather than the durable model.
3. relation-enriched `Book` variants may be views or projections, not separate entities.
4. `architecture`, graph runtime, reflected readers, task runtime, and application capabilities are
   still composed through partially overlapping abstractions.

## Research / Evidence

### Current BookOps Evidence

Primary files:

1. `web/src/data/graph/schema.ts`
2. `web/src/data/graph/entities.ts`
3. `web/src/data/graph/api.ts`
4. `web/src/architecture.ts`
5. `web/src/features/domain/sharing/book-sharing/entity.ts`
6. `web/src/features/domain/sharing/invite/entity.ts`
7. `web/src/features/domain/conversations/thread/entity.ts`
8. `web/src/features/domain/task-runs/entity.ts`
9. `web/src/features/domain/github/entity.ts`
10. `web/src/features/application/notifications/entity.ts`
11. `web/scripts/generate-ontahi-artifacts.mjs`

Useful contrasting cases:

1. `Todo`: small entity, identity, CRUD-like domain operations, durable operation.
2. `ReadingProgress`: browser-direct state mutation.
3. `PendingCollaboratorInvite`: server-authoritative workflow and relation-owned behavior.
4. `CommentThread`: entity with a substantial operation surface and cross-entity behavior.
5. `Book`: relations, custom graph methods, read models, server/bridge operations, durable work,
   policies, ingress, caching, and generated artifacts.

### Research Method

Each research track must produce:

1. an inventory of current BookOps cases,
2. a classification by semantic intent rather than current API name,
3. at least two candidate models,
4. a small code-shaped example,
5. runtime, type-system, reflection, codegen, and browser/server implications,
6. a decision or an explicitly documented unresolved question,
7. one focused proof when code is needed to decide,
8. migration consequences and obsolete concepts.

Research notes may live under `plans/research/` while incomplete. Decisions that survive belong in
this plan and later in Atlas.

Do not implement a general abstraction merely to make the current BookOps syntax compile.

## Scope

This plan includes:

1. unified entity declaration anatomy,
2. entity-centered reusable behavior,
3. reevaluation of the operation taxonomy,
4. relations, relation paths, views, and projections,
5. modular declaration composition and codegen discovery,
6. application capability composition,
7. Supabase storage/reflection composition,
8. tasks and durable execution as part of the operation model,
9. a gated BookOps migration after the model decisions.

## Non-Goals

1. Do not migrate all BookOps entities before the research gates close.
2. Do not preserve `Object.assign(...)`, graph/domain operation names, relation variants, or
   architecture adapters merely for compatibility.
3. Do not build Active Record or hide authority and execution policy behind convenient methods.
4. Do not solve multi-storage resource bindings here;
   [plan 120](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings) owns that larger
   environment model.
5. Do not redesign authorization policy; plan 78 owns policy semantics.
6. Do not move application-specific BookOps behavior into Ontahi packages.
7. Do not require one giant entity source file.

## Proposed Form

The only committed direction is that one semantic declaration represents one entity.

The following is a research sketch, not an accepted API:

```ts
export const Book = entity({
  name: 'Book',
  fields: { ... },
  identity: 'refById',
  locators: { ... },
  display: { ... },
  freshness: { ... },

  relations: () => ({
    collaborators: relation.many(BookCollaborator),
    labels: relation.many(BookLabel),
  }),

  behavior: context => compose(
    bookQueries(context),
    bookSharing(context),
    bookImport(context),
  ),
});
```

Questions intentionally left open:

1. Is `behavior` one concept or several?
2. Are reads, commands, policies, tasks, and transport-exposed operations variants of one
   operation model?
3. Should operations be nested under entities, relations, capabilities, or independent domain
   concepts linked back to entities?
4. Are relation-enriched results entity views, named selections, read models, or output schemas?
5. Does codegen analyze source syntax, compiled metadata, or a build-time application manifest?

## Active Work Session

This section is an intentionally lightweight working sequence over the Atlas graph.

It does not define new semantic containment or replace related plans. It records which research
thread is active now and the provisional order in which this session intends to traverse existing
and newly materialized work.

### Now

No child plan is active. The application-composition intervention is complete; the parent remains
open for the unresolved semantic classification and runtime-owned `TaskRun` work below.

### Completed Checkpoints

1. [71a Experimental Entity Relations Bridge](../done/71a-ontahi-relations-model-research.md)
2. [71b Unified Entity Capability Lift](bookops://plans/71b-unified-entity-capability-lift)
3. [71c Ontahi Application Module Composition](../done/71c-ontahi-application-module-composition.md)

### Provisional Queue

1. Operation model reevaluation.
2. Entity-centered behavior without `Object.assign(...)`.
3. Modular declarations and codegen discovery.
4. Application capability composition.
5. Supabase storage and reflection.
6. BookOps migration design.

Queue rules:

1. Only the active thread needs a child plan.
2. Materialize the next child when its research actually begins.
3. Reorder the queue when evidence changes the dependency structure.
4. Reference existing plans instead of duplicating them.
5. Close or absorb a child when its decision becomes part of the parent model.

## Execution Slices

Research is sequential. A later slice may use evidence from an earlier slice but should not silently
lock its design.

### Slice 0: Baseline Semantic Inventory

- [x] Record the high-level entity, operation, relation, companion, task, storage, and codegen
      inventory.
- [x] Retire the manual graph API classification problem: the composed application graph now
      preserves Entity, relation, operation, task, and reflection meaning at its source.
- [x] Classify and migrate the representative `entities.ts` companions into Selections, Queries,
      Commands, operations, projections, and typed value identities.
- [x] Record framework-owned `TaskRun` reflection as a durable-runtime evolution rather than
      keeping the semantic-convergence umbrella open for one implementation handoff.
- [x] Decompose `web/src/data/graph/entities.ts`: the application graph now comes directly from
      `bookopsApplication.graph`, while selections, projections, failure policy, repositories, and
      domain operations live with their owning domains.
- [x] Record and preserve reflection and codegen consumers through the completed application
      composition work in [71c](../done/71c-ontahi-application-module-composition.md).

Gate:

- BookOps' current surfaces can be discussed without using their implementation names as assumed
  ontology.

### Slice 1: Entity Declaration Anatomy

Research:

1. fields,
2. locators and identity,
3. display and freshness metadata,
4. mappings,
5. values and read models related to an entity,
6. declaration-time versus application-binding-time information.

Questions:

1. Which properties belong to the semantic entity?
2. Which belong to storage bindings or presentation?
3. Should mappings mutate an entity, bind externally, or become resource bindings?
4. How does one declaration remain safe to import from both server and browser bundles?

Proof:

- Model one simple BookOps entity with the candidate anatomy without operations.

Gate:

- `Todo`, one simple BookOps entity, and one metadata-rich entity fit without parallel schema
  declarations.

### Slice 2: Entity-Centered Behavior Without `Object.assign`

Inventory and classify current companion methods into:

1. reusable selection/query expressions,
2. graph commands,
3. business decisions,
4. authority-protected operations,
5. cross-entity workflows,
6. infrastructure helpers,
7. formatting or read-model assembly that may not belong to the entity.

Compare candidate models:

1. named selections/queries,
2. extension modules,
3. declaration fragments,
4. capabilities attached to an entity,
5. independent operations linked to an entity,
6. generated convenience methods over explicit declarations.

Questions:

1. Should `Book.findOwnerBySlug` exist?
2. If it exists, is it data-language reuse or an application operation?
3. How are methods composed across files without mutation?
4. What metadata and authority must remain visible?

Proof:

- Replace one representative patched companion in an isolated test with no loss of graph
  composition or reflection.

Gate:

- The candidate removes `Object.assign(...)` without inventing an untyped plugin bag or hiding
  operation boundaries.

#### Research Note: Derived Value Identity And Invalidation

The last production `Object.assign(...)` attached to `Book` is not another query companion. It
adds eight factories for `ServerRuntimeValueRef`:

1. `list`,
2. `bySlug`,
3. `tableOfContents`,
4. `chapter`,
5. `chapterNavigation`,
6. `firstChapter`,
7. `labels`,
8. `chapterPage`.

Eight read operations currently declare `cache.value` and, where applicable, `cache.dependsOn`.
Three mutations declare `effects.affects`. The server operation runner:

1. still addresses a cache entry by operation scope plus serialized input,
2. registers that entry under every normalized value ref returned by `value` and `dependsOn`,
3. removes all entries indexed under refs returned by `affects`.

Therefore a runtime value ref is currently a semantic invalidation identity/tag, not the cache
entry's primary lookup key. It describes logical data such as “Book chapter X in language Y” and
connects reads and mutations without requiring either side to know the concrete cached operation.

This server-runtime mechanism is also distinct from:

1. entity `freshness`, which reconciles normalized client entity records,
2. `bridge.invalidate`, which codegen projects into React/client query invalidation,
3. entity refs and locators, which identify persisted semantic entities.

The concepts may converge later, but treating them as synonyms now would hide three different
lifecycles.

Candidate minimum model:

```ts
const Book = entity({
  name: 'Book',
  fields: {
    /* ... */
  },
  values: {
    list: valueRef(),
    bySlug: valueRef((bookSlug: string) => [bookSlug]),
    tableOfContents: valueRef((bookSlug: string) => [bookSlug]),
    chapter: valueRef((input: FetchChapterInput) => [
      input.bookSlug,
      input.partSlug ?? 'root',
      input.chapterSlug,
      input.language ?? 'en',
    ]),
  },
  operations: {
    /* ... */
  },
});
```

The declaration should produce typed factories such as `Book.values.chapter(input)` without
mutation or `Object.assign`. Operations may initially keep the existing explicit metadata:

```ts
cache: {
  value: input => Book.values.chapter(input),
  dependsOn: input => [
    Book.values.bySlug(input.bookSlug),
    Book.values.tableOfContents(input.bookSlug),
  ],
},
effects: {
  affects: ({ input }) => [Book.values.chapter(input)],
},
```

Initial constraints:

1. value identities are schema/application metadata and should be reflectable,
2. their key tuple must remain typed and deterministically serializable,
3. they do not contain resolvers or storage access,
4. they do not imply a persisted entity locator,
5. this slice does not unify server invalidation with React bridge invalidation,
6. resolver attachment and inference of `cache.value` can be researched after the explicit form
   removes the mutation-based companion.

Decision gate:

- Add `values` to the unified entity/application binding only if it can reproduce the eight Book
  refs and current runner behavior without changing cache lookup, codegen, or client invalidation.

Implementation outcome:

1. `valueRef()` now declares a typed deterministic key tuple without repeating entity or value
   kind names.
2. Entity/application binding exposes the resulting factories under `Entity.values`.
3. `Book` migrated all eight value identities and its final `Object.assign(...)` was deleted.
4. Existing `cache.value`, `cache.dependsOn`, and `effects.affects` metadata remains explicit.
5. Server cache lookup, codegen, bridge invalidation, and normalized client cache behavior were not
   changed.

### Slice 3: Reevaluate The Operation Model

Do not begin with graph operation versus domain operation as accepted categories.

Classify operations across independent axes:

1. authored intent: read, state transition, decision, workflow, task,
2. authority: caller-authoritative, server-authoritative, delegated,
3. exposure: local, browser-direct, bridge, ingress, internal,
4. execution: immediate, durable, scheduled, streamed,
5. target: entity, relation, selection, value/read model, application capability,
6. effects: graph-only, external effects, emitted intents/events,
7. policy: requirements, authorization, rate limits, idempotency,
8. transport and cache behavior.

Pressure tests:

1. `ReadingProgress.saveReadingProgress`,
2. `PendingCollaboratorInvite.acceptInvite`,
3. `Book.fetchBooks`,
4. `Book.internalImportFromGithubMarkdown`,
5. `CommentThread.toggleMessageReaction`.

Candidate outcomes:

1. retain two operation kinds with clearer semantics,
2. unify them under one operation definition with capability profiles,
3. model graph commands as implementation details and expose only operations,
4. model direct/client execution as an execution binding rather than an operation kind.

Gate:

- One model explains the pressure tests without authority ambiguity or duplicated execution
  machinery.

### Slice 4: Relations, Views, And Projections

Active child:

- [71a Experimental Entity Relations Bridge](../done/71a-ontahi-relations-model-research.md)

Research separately:

1. semantic relationship declaration,
2. physical relation mapping,
3. relation-root traversal,
4. relation-owned operations,
5. relation-enriched entity results,
6. named views and read models,
7. lazy/circular entity references,
8. reflection and Explorer representation.

Pressure tests:

1. `BookCollaborator.belongsTo(Book)`,
2. `BookWithCollaborators`,
3. `BookCollaborators.invite`,
4. `NotificationDeliveryWithNotification`,
5. Reader chapter/section/subsection trees.

Questions:

1. Is `BookWithCollaborators` a distinct graph API entity?
2. Can a relation own operations such as `invite`?
3. Do views preserve entity identity?
4. Which read models are part of domain topology but not persistent entities?

Gate:

- Relations and views have distinct names and metadata; relation variants no longer masquerade as
  duplicate entities.

### Slice 5: Modular Declarations And Discovery

Research:

1. composing a large entity from feature-owned modules,
2. avoiding cyclic initialization,
3. static code analysis versus runtime reflection,
4. server-only implementation separation from browser-safe metadata,
5. generated task/workflow bundles,
6. deterministic operation/entity ids,
7. diagnostics across imported fragments.

Pressure test:

- `Book` must remain split by reading, sharing, import, search, and settings concerns.

Gate:

- A large entity can have one semantic identity without one giant file, mutation, manual registry
  duplication, or server code leaking into browser bundles.

### Slice 6: Application Capability Composition

Reconcile:

1. `ontahi(...)`,
2. `architecture(...)`,
3. graph runtime,
4. auth,
5. requirements,
6. concerns and rate limits,
7. effectors,
8. task execution/storage,
9. ingress and operation dispatch,
10. host observability/error capabilities.

Questions:

1. Which are application capabilities?
2. Which are runtime resources?
3. Which are host integrations?
4. Which namespaces are semantic and which are historical adapter bags?
5. How does Next.js mount the same application as Express without duplicate wiring?

Gate:

- BookOps can describe its application composition once without losing host-specific capabilities
  or recreating a generic `adapters` object.

### Slice 7: Supabase Storage And Reflection

Research:

1. Supabase execution runtime,
2. contextual user/service-role clients,
3. storage mappings,
4. reflected entity data,
5. security boundary around Explorer reads,
6. request-scoped resources,
7. lifecycle and error translation.

Boundary:

- Solve one default BookOps storage. Defer per-entity multi-storage/resource selectors to
  [plan 120](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings).

Gate:

- Execution and reflection delegate to one configured storage capability while access policy stays
  explicit.

### Slice 8: Migration Design

Only after slices 1-7 have decisions:

1. select a simple schema-only entity,
2. select a metadata/relation-rich entity,
3. migrate `ReadingProgress` as the operation-model proof,
4. migrate one server-authoritative workflow,
5. migrate one modular entity,
6. migrate `Book` last,
7. replace `BookopsDataGraphApi + architecture` with the decided application root,
8. remove superseded APIs and compatibility layers while the codebase is still small.

Each migration step must identify deleted concepts, not only new syntax.

## Verification

Research verification:

1. Every slice has an evidence inventory, candidate comparison, code sketch, decision, and gate
   result.
2. Decisions explain which current BookOps abstractions disappear, survive, or change meaning.
3. Atlas/Explorer reflection requirements are evaluated for each semantic concept.
4. Browser/server import boundaries and codegen are evaluated before API acceptance.

Implementation verification:

1. Todo remains compact and unchanged in spirit.
2. BookOps graph API contract tests preserve entity, operation, durable task, and ingress behavior.
3. BookOps unit, integration, generated-artifact, Next.js build, and manual smoke tests pass.
4. No `Object.assign(...)` entity companion patching remains in migrated surfaces.
5. No duplicate entity/schema declaration is introduced to satisfy codegen.
6. No graph/domain distinction survives solely because compatibility required it.
7. Relations, views, read models, and entities are distinguishable in reflection.

## Decisions

1. This plan supersedes the earlier implementation-first framing of plan 71.
2. BookOps is research evidence, not the schema of Ontahi's API.
3. One semantic entity declaration remains the direction validated by Todo.
4. `Object.assign(...)` companion patching is not an accepted target abstraction.
5. Graph operations versus domain operations is reopened as a model question.
6. Relations are a known missing first-class capability.
7. Research gates precede broad BookOps migration.
8. Backward compatibility is not a priority when a concept is clearly superseded and active
   consumers can migrate together.

## Historical Questions And Disposition

1. Durable Operation is a Domain Operation lifecycle with reflected TaskRun acceptance, progress,
   step, failure, and final-output contracts; additional engines remain adapters.
2. Entity declarations now infer conventional identity and expose `one`, `many`, `array`, bound
   operations, Selections, Queries, and Commands. Reference Field completion remains plan 125.
3. Operations accept Refs and Selections without pretending those targets are materialized Entity
   objects. Relation-owned behavior and richer read-model topology remain separate directions.
4. Application modules, nominal Entity references, deferred preparation, and operation groups
   removed order-sensitive application declaration mutation.
5. `@ontahi/codegen` analyzes a stable application IR rather than treating BookOps source syntax as
   the model.
6. Storage is an execution capability; request/environment resource selection remains plan 120.
7. First-class value/read-model topology remains the bounded Ontahi Explorer work in plan 77.
8. Reusable access criteria are Selections and shaped Queries; direct Commands own plain data
   changes. Remote execution of the same programs remains plan 128 rather than wrapper-method
   generation.

## Closure / Evolution

This plan closes when:

1. the research tracks have explicit decisions,
2. Ontahi's entity/application/operation/relation model has absorbed the surviving BookOps
   requirements,
3. BookOps uses the resulting public API,
4. obsolete schema, companion, operation-kind, registry, and architecture surfaces are removed,
5. remaining environment/resource work is cleanly handed to
   [plan 120](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings).

The original plan 71 history is preserved through git. This rewrite changes its role from an
entity-action implementation plan into the semantic convergence workstream discovered by the
portability example.

The convergence workstream is now complete. BookOps composes one application graph, unified Entity
declarations own their semantic fields and behavior, `Object.assign(...)` companions no longer
define application ontology, and the Todo application plus the first developer book teach the same
public model. The remaining gaps are already narrower durable workstreams: Reference Fields,
invariants, Capability contracts, authorization, GraphOS topology, runtime data reflection, and
environment resources.

The one transitional ownership seam retained here is `TaskRun`: BookOps declares it through the
unified Entity API, while a future durable-runtime slice may supply the standard semantic Entity and
operations. That handoff is recorded in the Durable Workflows Atlas item; it is not unfinished
semantic convergence.

## Closure

- Status: done
- Closed on: 2026-08-12
- Effective effort: historical multi-slice work; not estimated
- Follow-ups:
  - [`125. Ontahi Reference Fields`](ontahi://plans/125-ontahi-reference-fields)
  - [`123. Ontahi Declarative Entity Invariants`](ontahi://plans/123-ontahi-declarative-entity-invariants)
  - [`124. Ontahi Capability Dependency Contracts`](ontahi://plans/124-ontahi-capability-dependency-contracts)
  - [`120. Ontahi Environment Resources And Semantic Bindings`](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)
