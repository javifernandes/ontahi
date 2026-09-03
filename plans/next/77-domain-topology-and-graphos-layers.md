# 77. Domain Topology And Ontahi Explorer Layers

Status: next

Canonical ID: `ontahi://plans/77-domain-topology-and-graphos-layers`

Migrated from: `bookops://plans/77-domain-topology-and-graphos-layers`
Original path: `plans/next/77-domain-topology-and-graphos-layers.md`
Source commit: `4b86f3c6`

Related plans:

1. [74 Entity Refs And Unit Of Work](bookops://plans/74-entity-refs-and-unit-of-work)
2. [75 Operation Result Contracts](bookops://plans/75-operation-result-contracts)
3. [76 Operation Input Metadata And UI](bookops://plans/76-operation-input-metadata-and-ui)
4. [74d Graph Client Cache Rollout And Devtools](bookops://plans/74d-graph-client-cache-rollout-and-devtools)
5. [73 Embedded Graph Ops Console](bookops://plans/73-embedded-graph-ops-console)

## Summary

GraphOS should become a layered topology of the application domain and architecture, not only a set of isolated lists for entities, operations, events, and tasks.

Naming update from the Ontahi extraction line: **Ontahi Explorer** is the product-facing UI surface and future React package surface; **GraphOS** remains the conceptual/model vocabulary for the layered domain topology that the Explorer visualizes. Existing `GraphOps` names describe the current BookOps implementation and can be retired gradually.

Graph was initially explored through entities, operations, and tasks as separate administrative sections.
That was useful, but incomplete.
Once operation inputs and outputs became reflective, GraphOps started surfacing a richer domain graph:

1. entities with identity,
2. entity refs and locators,
3. relations between entities,
4. value objects,
5. read models and views,
6. operation input and output contracts,
7. union variants and alternative shapes,
8. durable tasks and workflow-backed behaviors,
9. runtime, authority, infrastructure, and observability concerns.

The next conceptual step is to treat GraphOS not only as an operation/entity explorer, but as a layered topology of the application domain and architecture.

The product feeling:

> GraphOS should let a human, tool, or LLM move from "what exists in this domain?" to "how does this behavior execute, under which authority, on which runtime, through which resources?"

## Context

GraphOps currently answers useful local questions:

1. Which entities exist?
2. Which operations exist?
3. Which task definitions exist?
4. What does this one operation receive and return?

It does not yet answer topology questions:

1. What is the domain shape as a whole?
2. Which non-entity types are central domain concepts?
3. Which operations connect these types?
4. Which relationships own behavior?
5. Which runtime layer executes this behavior?
6. Which infrastructure resource supports it?
7. Which authority or policy gates it?

Operation output reflection made the gap visible. BookOps looked like a small set of persistent entities, but real operation outputs surfaced richer domain types such as `ChapterPageViewer`, `ChapterPageBookShell`, `ChapterNode`, `TocPart`, `ContentBlock`, `ParagraphBlock`, `CodeBlock`, `FigureBlock`, `Exercise`, `TableRow`, `Token`, and `NavigationEntry`.

Some of these have no independent persistence identity. Some are read models. Some are value objects. Some are variants inside union results. They still belong to the domain topology.

> [!EVIDENCE]
> target: [[ontahi.model.domain-operation|Domain Operation]]
> Operation input/output reflection showed that domain operations are not isolated callable functions. They are edges in a richer domain topology that connect entities, value objects, read models, authority, runtime, resources, and evidence.

## Research

The working model is closer to a layered map than to a table browser.

GraphOS should let the same system be viewed through several lenses:

1. Conceptual: entities, value objects, read models, relations, operations, events.
2. Contract: inputs, refs, locators, outputs, variants, constraints, failures.
3. Data: tables, identities, locators, indexes, query paths, mutation paths.
4. Runtime: browser, server action bridge, HTTP ingress, workflow runtime, worker, callback.
5. Authority: authentication requirements, ownership checks, collaborator checks, service-role authority, policy boundaries.
6. Infrastructure: Supabase, Redis, email, Workflow, queues, search, observability.
7. Observability: traces, spans, execution history, failures, latency, cache behavior, durable task progress.

This does not require a heavy graph visualization in the first slice. A hierarchical topology view with backlinks into the existing GraphOps panels is enough.

## Scope

This plan shapes GraphOS as a structure-level map.

In scope:

1. First-class domain types beyond entities.
2. Type detail views.
3. Operation backlinks from input/output types.
4. Relation and operation edges between domain nodes.
5. Layer badges for runtime, authority, infrastructure, and observability metadata when available.
6. A topology descriptor that tools can consume.

Out of scope:

1. Replacing the existing GraphOps sectioned UI immediately.
2. Building a full graph visualization engine in this slice.
3. Solving authorization declaratively now.
4. Solving UnitOfWork or normalized client cache now.
5. Inferring every runtime or infrastructure dependency automatically.
6. Modeling instance-level data navigation.

## Proposed Form

GraphOS should understand these node kinds:

1. `Entity`: a domain object with identity and locators.
2. `ValueObject`: a semantic type without independent identity.
3. `ReadModel`: a derived or presentation-oriented domain shape.
4. `Operation`: a behavior contract with input, output, effects, failures, and invocation flavor.
5. `Relation`: a first-class domain connection, potentially owning behavior.
6. `Event`: a domain occurrence or integration signal.
7. `Task`: a durable or background operation definition.
8. `Policy`: an authority rule, requirement, or permission boundary.
9. `Resource`: an architectural dependency such as Supabase, Redis, email, Vercel Workflow, or a queue.
10. `Runtime`: an execution environment such as browser, server, workflow, worker, or external ingress.

GraphOS should also understand edge kinds:

1. entity has field,
2. entity has relation,
3. relation connects entities,
4. operation receives type,
5. operation returns type,
6. operation emits event,
7. operation mutates entity or relation,
8. operation requires policy,
9. operation runs on runtime,
10. runtime uses resource,
11. task tracks operation,
12. read model projects entities or value objects.

Example topology:

```text
Book
  has chapters -> ChapterNode
  loadChapterPage(Book ref, Chapter ref) -> ChapterPage
  collaborators relation
    invite(Profile ref | email)
    remove(Profile ref | invite ref)

ChapterPage
  viewer -> ChapterPageViewer
  book -> ChapterPageBookShell | ChapterPageAccessDeniedBook
  chapter -> ChapterNode
  toc -> TocPart | StandaloneChapter
  navigation -> ChapterNavigation

Book import
  starts durable operation
  runs on Vercel Workflow
  writes Book, ContentNode, ContentBlock
  emits task progress through TaskRun
```

The current section/list UI should remain as a practical index. The topology view should add integrative navigation:

1. domain type tree,
2. expandable relation and operation edges,
3. selectable schema variants,
4. backlinks to entity, operation, event, and task panels,
5. compact layer metadata.

## Execution Slices

### Slice 1: Type Registry

[ ] Collect nominal value and read-model types from operation schemas.
[ ] Distinguish entities from non-entity domain types.
[ ] Expose type references from operation input/output descriptors.
[ ] Add a `Types` or `Domain Types` section in GraphOps.

### Slice 2: Type Detail View

[ ] Add a detail page or panel for any domain type.
[ ] Show fields and schema variants.
[ ] Show operations that receive the type.
[ ] Show operations that return the type.
[ ] Show entities, read models, and values it references.
[ ] Link back to existing schema trees.

### Slice 3: Topology View

[ ] Create a hierarchical domain map.
[ ] Render expandable entity, value, read-model, relation, and operation nodes.
[ ] Link existing entity, operation, event, and task sections into the topology.
[ ] Keep the first version simple enough to scan and navigate.

### Slice 4: Layer Metadata

[ ] Attach runtime tags.
[ ] Attach authority requirements.
[ ] Attach resource dependencies.
[ ] Attach durable operation metadata.
[ ] Attach cache and ref-resolution metadata where available.

### Slice 5: Tooling Surface

[ ] Expose a JSON topology descriptor.
[ ] Keep the descriptor stable enough for LLM and MCP-style tooling.
[ ] Add helpers for "what touches X?" impact questions.
[ ] Add follow-up hooks for future graph queries.

## Verification

[ ] GraphOps can list reflected domain types beyond entities.
[ ] A type detail view can show fields, variants, and operation backlinks.
[ ] The UI can answer which operations return or receive a type.
[ ] Existing entity, operation, event, and task sections link into the topology.
[ ] The topology descriptor can be consumed without reading React UI state.
[ ] Runtime, authority, infrastructure, and observability layers have explicit follow-up work.

## Decisions

1. Keep the current list-based GraphOps UI as an index.
2. Add topology as an integrative layer instead of replacing everything at once.
3. Treat operation contracts as evidence that domain topology includes non-entity types.
4. Prefer progressive disclosure over rendering every field and edge at once.

## Closure / Evolution

This plan is still active. It should close when the first topology slice exists and GraphOS can explain at least one real BookOps feature through domain types, operation contracts, and backlinks.

Expected follow-ups:

1. a graph-native type registry,
2. relation-owned operation edges,
3. runtime and authority layer metadata,
4. MCP or JSON export for tools,
5. a larger visualization once the semantic model is stable enough to justify it.
