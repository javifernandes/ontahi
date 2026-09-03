# 122. Ontahi Developer Book

Status: done

Canonical ID: `ontahi://plans/122-ontahi-developer-book`

Migrated from: `bookops://plans/122-ontahi-developer-book`
Original path: `plans/done/122-ontahi-developer-book.md`
Source commit: `cb9c038a`

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Durable shape: [`Ontahi for Developers`](ontahi://atlas/learning-materials/ontahi-library/developer-oriented-docs)

Source plans:

1. [`100h. Ontahi Portability Example And Developer Guide`](./100h-ontahi-portability-example-and-developer-guide.md)
2. [`71c. Ontahi Application Module Composition`](./71c-ontahi-application-module-composition.md)

## Summary

Create a concise, code-led Ontahi developer book in the Ontahi Library, as a sibling of Living
Systems. Teach the framework through one canonical application shape and its own semantic
distinctions, without recounting the BookOps extraction path. Keep comparisons out of the main
narrative; short margin notes may contrast a familiar pattern when they make the pressure behind
an Ontahi abstraction concrete.

Begin with an evidence-based inventory of the current framework surface. Classify every relevant
public concept and implementation as `canonical`, `advanced`, or `transitional`, then author the
book from the canonical path. Where no semantic replacement exists, teach the smallest current
draft surface and label it without implying that its API is settled.

## Context

Ontahi now has an independent Todo application, a production BookOps host, a unified `ontahi()`
composition root, semantic entities and references, operations, relations, selections, runtime
capabilities, storage adapters, transport adapters, codegen, React integration, and Explorer.

Existing knowledge is distributed across package exports, tests, example READMEs, Atlas concepts,
and historical plans. The material proves the model but does not yet give a new developer one
short, authoritative way to learn it. Historical and transitional APIs can easily leak into a guide
unless the public teaching surface is decided first.

## Research / Evidence

The inventory must derive current state in this order:

1. exported package entrypoints and declaration types,
2. executable examples and host composition,
3. behavioral and conformance tests,
4. BookOps usage as production pressure,
5. Atlas items for durable meaning,
6. plans only for unresolved or explicitly transitional work.

The Todo Express example is the executable spine. BookOps supplies cases that the small example
does not yet exercise, but BookOps-specific repositories, policies, routes, and naming must not be
presented as framework requirements.

## Scope

1. Inventory Entity, Ref, Relation, Selection, Query, Command, Domain Operation, Durable
   Operation, Capability, Runtime, Application, reflection, codegen, React, and Explorer.
2. Inventory the in-memory, PostgreSQL, Supabase, Express, Next.js, and Vercel Workflow
   implementations against their framework ports and host responsibilities.
3. Classify public surfaces as `canonical`, `advanced`, or `transitional`, with evidence and a
   recommended replacement for every transitional teaching candidate.
4. Decide whether `PQL` is a public name with a precise boundary or retire it from developer-facing
   vocabulary in favor of selections, queries, and commands.
5. Define the book manifest, chapter sequence, code-example policy, and links to runnable sources.
6. Author the smallest complete first edition and make it importable as a new BookOps book beside
   Living Systems.
7. Verify code snippets against the current packages or extract them from tested example sources.
8. Close narrowly evidenced authoring friction when the executable chapters expose avoidable
   ceremony in the canonical path.

## Non-Goals

1. Retelling Ontahi's extraction from BookOps.
2. Comparing Ontahi concept-by-concept with GraphQL, ORMs, DDD frameworks, or other technologies
   in the main narrative or as a parallel tutorial.
3. Freezing unfinished authorization, relation-owned behavior, saved selections, or resource
   binding as if they were current guarantees.
4. Producing exhaustive generated API reference in the first edition.
5. Moving the `ontahi-library` source into this repository.
6. Broad framework redesign unrelated to the executable examples; larger discovered gaps become
   focused follow-up plans.

## Proposed Form

The book follows one application from declaration to use:

```ts
export const TodoApplication = ontahi({
  storage,
  tasks: inProcessTasks(),
  capabilities,
  entities: [TodoList, Todo, Tag, TodoTag],
});
```

The final first edition contains 27 chapters in five parts:

1. Getting Started: One Application; Your First Entity.
2. Core Concepts: Entities; Identity, Locators, and Refs; Relations; Selections; Queries; Commands;
   Operations; Operation Contracts and Failures; Durable Operations.
3. Runtimes: Runtime Composition and Capabilities; Storage Adapters; Transport and HTTP Ingress.
4. Reflection and Clients: Reflection and Explorer; Browser Client and Projection.
5. Further Directions: the map; AI Operations; Selection as an Editable Language; Runtime Data
   Reflection; Alive UI; Continuous Execution and First-Class Events; Semantic Operational Policy;
   A Topology of Graphs; More Adapters, Same Contracts; Living Entities; Data Graph Across
   Boundaries.

Each chapter should establish a distinction through a small real code path, use it first from Node,
then show the same operation through React when a UI makes the result concrete. The later browser
chapter explains projection internals; it is not the first appearance of React. Theory appears only
where it sharpens use.

## Execution Slices

### Slice 1: Canonical Surface Inventory

- [x] Produce the `canonical / advanced / transitional` inventory from exports, tests, Todo, and BookOps.
- [x] Record the stable semantic chain from Application through Entity, Selection, and Operation.
- [x] Separate framework contracts, adapter implementations, and host responsibilities.
- [x] Resolve the developer-facing meaning of `PQL`.
- [x] Route material API gaps to focused plans without expanding this plan into framework redesign.

### Slice 1b: Teaching Surface Ergonomics

- [x] Default ordinary domain operations to server authority and their owning entity layer.
- [x] Invoke bound operations directly from their entity (`TodoList.list()`).
- [x] Accept an Entity Ref where an operation contract requires a singleton Selection.
- [x] Omit an input argument when an operation has no input contract.
- [x] Keep Ref and Selection distinct inside the runtime while removing boundary boilerplate.
- [x] Return relation-root reads directly from domain operations.
- [x] Preserve cross-entity operation schemas through generated browser projections.
- [x] Accept and normalize Entity Refs in React operation-query inputs.
- [x] Author predicate membership from bound and generated entities with `Entity.selection(...)`.
- [x] Reuse one Selection as a Node read, React filter/query input, and operation target.
- [x] Separate Selection membership from the Queries and Commands that interpret it.
- [x] Align bound Node operation input types with the generated client's existing support for
      identity scalars and materialized entity records.
- [x] Express closed string exclusions as reflected field constraints so static admissibility does
      not disappear inside executable operation preconditions.
- [x] Add one executable Todo Capability so the composition chapter can show an Entity declaring a
      narrow host need and the application supplying its implementation.
- [x] Attach public draft parsing to the operation input contract with
      `operation.input.safeParse(draft)`.
- [x] Let `useOperation(operation, initialInput)` own an editable, validated input and execute its
      normalized value without a second hook or a duplicated invocation argument.
- [x] Keep dynamic boolean preconditions fluent with lazy
      `selection.exists().thenIf(...)` composition instead of requiring generator syntax.
- [x] Let low-level effectful resources use sync, async, or Effect host implementations without
      repeating `Effect.sync(...)` around ordinary provider code.

### Slice 2: Book Shape

- [x] Confirm the title, manifest identity, source repository path, and BookOps import path.
- [x] Freeze a compact first-edition table of contents from the canonical inventory.
- [x] Define snippet verification and links to runnable examples.
- [x] Define the editorial rule: Ontahi directly in the main narrative; only concise, purposeful
      comparisons in margin notes.

### Slice 3: First Edition

- [x] Author the chapters with one continuous executable example.
- [x] Add only the conceptual explanation needed to use each abstraction correctly.
- [x] Include concise adapter and host-responsibility maps.
- [x] Add only the architecture diagrams that materially clarify runtime topology, direct versus
      bridged client execution, and durable-operation lifecycle.
- [x] Add an advanced-reference boundary without teaching transitional APIs as defaults.
- [x] Close with a compact, explicitly non-promissory map of the next semantic directions and link
      its two concrete lines to durable Atlas plans.

### Slice 4: BookOps Publication

- [x] Add the new book to the Ontahi Library source beside Living Systems.
- [x] Import and render it in BookOps through the existing book pipeline.
- [x] Verify navigation, code surfaces, links, responsive reading, and dark mode.
- [x] Verify every executable snippet against the represented package version.

## Verification

- [x] A developer can follow one path from entity declaration to a running UI without BookOps knowledge.
- [x] The main path uses canonical APIs or explicitly labels a required draft surface.
- [x] Every framework/adapter/host boundary is explicit and internally consistent.
- [x] Todo remains runnable from the commands referenced by the book.
- [x] No chapter requires historical plans to understand the current API.
- [x] The book appears in BookOps as a sibling of Living Systems.

## Decisions

1. This is a new Ontahi Library book, not an expansion of the Living Systems essay.
2. Inventory precedes prose so compatibility surfaces do not become accidental doctrine.
3. The book teaches one recommended form; advanced variants are secondary. A required draft API
   may appear only when its provisional boundary is explicit and no canonical replacement exists.
4. The framework is explained through its own internal distinctions and executable consequences.
5. Todo is the teaching spine; BookOps validates seriousness and reveals missing abstractions.
6. Executable documentation is API pressure: small, well-evidenced friction may be fixed in this
   plan instead of being preserved as teaching ceremony.
7. Comparisons are editorial annotations, not the book's organizing frame. A margin note may show
   the extra API surface an Ontahi abstraction removes, while the executable path stays purely
   Ontahi.
8. Storage and transport are separate chapters. Storage teaches the complete
   in-memory/PostgreSQL binding; Supabase remains production reference material until its
   application-storage assembly is as direct as the main path.
9. Transport distinguishes the generic operation bridge from operation-declared HTTP ingress.
   BookOps webhooks supply the production evidence, while provider routing and delivery semantics
   remain explicitly low-level.
10. Diagrams are explanatory runtime maps, not chapter decoration. The first set is limited to
    application topology, browser-direct versus bridged execution, and durable run lifecycle.
11. Transport examples stay application-neutral. The Express host may choose one `mountPath`, the
    Fetch client receives the same explicit root, and provider registries are the only required
    application wiring for reflected HTTP ingress.
12. The browser chapter teaches generated Entities as an executable semantic projection, not a
    shared server bundle. Entity identity, observation identity, reconciliation, and invalidation
    are the durable concepts; TanStack Query and the draft `clientCache` metadata stay beneath the
    main authoring surface.
13. Reflection and Explorer remain separate layers: the composed Graph API owns the runtime
    catalog, Explorer projects neutral tooling descriptors from it, and the host explicitly grants
    data reading, operation invocation, task loading, routing, and access.
14. Use real UI captures when the UI is itself the abstraction being taught. The Explorer chapter
    shows its overview, Entity topology, and operation schema from a production-shaped host;
    captions remain application-neutral and the prose still teaches Ontahi rather than the host.
15. Snippets are progressive excerpts backed by `todo-express` or focused package tests. They may
    omit surrounding imports and previously introduced defaults, but must not invent a public call
    shape; explicitly draft surfaces remain labeled instead of being promoted by compilation alone.
16. The developer book shares the `ontahi-botanical-language` manifest theme with Living Systems.
    Both books therefore use one Ontahi collection identity—including typography, navigation,
    canvas texture, code surfaces, and light/dark tokens—while their content remains independent.
17. Mermaid diagrams inherit the active book's semantic visual tokens instead of carrying a
    hardcoded palette. Wide architectural flowcharts use top-down layouts at reader width, while
    their frame owns horizontal overflow on narrow screens without widening the page.
18. A final Further Directions part distinguishes current framework guarantees from future work.
    Its opening chapter names the map, then each direction receives one concise chapter and stable
    route. `AI Operations` is the visible name for model-backed execution and its gradual
    soft-to-hardened development curve. Runtime Data Reflection is separated as the dynamic,
    storage-informed foundation for headless Alive UI. The Selection language editor, events,
    streaming, operational policy, graph segmentation, adapters, and Living Entities remain around
    the same semantic base.
19. Further-direction chapters use compact architecture diagrams when the direction is primarily a
    relationship between semantic inputs, runtimes, policies, and projections. The diagrams carry
    the topology; the prose states guarantees, boundaries, and uncertainty.
20. The final narrative is organized by Ontahi's actual abstractions. Getting Started stays small;
    Part II is the semantic backbone from Entity through durable Operation; Part III owns runtime
    composition; Part IV owns reflection and clients. The Data Graph Across Boundaries direction
    preserves Query and Command as ubiquitous programs rather than requiring transport-only wrapper
    Operations.

## Current Checkpoint

The first executable chapters now establish the application, a directly callable entity, identity,
Refs, relations, basic mutations, and predicate-defined Selections from Node, followed by compact
React uses of the same values and operations. The slice also removed the authoring ceremony those
chapters exposed: ordinary operations receive safe server defaults, bound entities expose their
operations directly, a Ref transparently satisfies a singleton Selection input, relation-root reads
can be returned as ordinary operation results, and `Entity.selection(...)` authors the same
transport-safe membership value from Node or a generated browser entity. The book now makes the
execution boundary explicit: a Selection describes membership without loading entities, while a
Query observes it and a Command changes it. Cache identity and invalidation mechanics remain
deferred to the browser-projection chapter. Operation contracts and structured failures now extend
the same Todo path with input validation, preconditions, direct Node handling, and React handling.
Targeted comparisons are permitted only as margin notes; the first explains how semantic targets
avoid multiplying transport-specific mutations. The durable chapter now separates immediate run
acceptance from progress snapshots and eventual output, follows the same run from Node and React,
and states the current polling and process-local-runtime limits without presenting them as domain
constraints. The contracts chapter now keeps statically knowable admissibility in reflected input
schemas and reserves executable preconditions for facts that require runtime resolution. That
correction added a structured string-exclusion constraint and exposed entity-level uniqueness as a
separate declarative-invariant gap rather than pretending that a query precheck is atomic. Part III
now opens with Capabilities and runtime composition: `TodoList.create` coordinates persistence with
a host-supplied notification Capability, while Node and React continue to invoke only the operation.
The chapter states the current boundary honestly: Capability use is typed, but dependency
reflection and composition-time completeness checks are not yet provided. Operation input parsing
now lives on the operation contract itself, and React can bind one editable draft, its inline
issues, and execution through the managed `useOperation` form. The original imperative hook form
remains available when the caller owns its input elsewhere. The contracts chapter now also maps
the full execution envelope—requirements, pre/postconditions, concerns, and success effects—and
marks the code-bearing middleware/hook spellings as transitional. Dynamic existence checks compose
as lazy boolean computations with `thenIf(...)`, keeping ordinary preconditions independent from
Effect generators. The Capabilities chapter now marks the whole injection surface as draft and
low-level rather than presenting generic resource injection as Ontahí's final semantic model. A
single lazy host-edge adapter lets providers use ordinary sync or async functions while operations
continue to consume a uniform Effect contract. Storage now has its own chapter carrying the same
semantic application from process-local state to PostgreSQL, with conventional physical mapping,
reflection, and host-owned migrations. A separate transport chapter distinguishes the generic
operation bridge from explicit HTTP ingress, uses an application-neutral GitHub webhook example,
and explains multi-channel routing, delivery, idempotency, and the current low-level host binding.
The documentation pressure also landed `mountPath` on the Express and Fetch adapters and
provider-registry composition directly in `ontahiExpress(...)`, removing manual
reflected-route/router/dispatcher wiring from the main path.
Supabase remains outside the main storage-composition form while its browser runtime supplies an
important second execution path: ordinary Data Graph Queries and Commands can execute directly
from the client under RLS, while domain-operation intentions cross the bridge to the server. Three
focused diagrams now make that split, the wider client/server/worker/storage topology, and durable
run acceptance/execution/observation visible.
Part IV now opens by following the application into its generated browser projection. The chapter
separates the identity of an observed result set from the identity of the Entities inside it,
shows how operation output contracts normalize overlapping snapshots through canonical Refs, and
explains reconciliation, broad declared invalidation, and durable completion timing without
making React Query part of the domain vocabulary. It also marks narrower `clientCache` metadata as
an advanced surface still in motion.
The fourteenth chapter completes the current runtime narrative with reflection, Explorer, and a
framework/adapter/host responsibility map. It distinguishes the serializable Graph API summary,
rich runtime catalogs, generated client surface, and Explorer descriptors; mounts the reflective
HTTP surface through Express; and shows that reflected Entity reads and operation execution are
separate host-granted capabilities rather than privileges implied by rendering Explorer. The
chapter also establishes the security boundary explicitly: Explorer is tooling, not
authorization, and app-specific snapshot, task-run, event, routing, credential, and access wiring
remain host work.
Part V opens with a seventeenth chapter that separates current guarantees from further directions and
names the complete map. Chapters eighteen through twenty-seven then give each direction its own
concise, stable route. The AI Operations chapter recovers the AI-native design first explored
around Semantic Editorial: fuzzy intent resolution and model execution are distinct roles joined
by a typed Operation Invocation; implementation mode, lifecycle, and maturity remain independent
axes. It also makes the development curve explicit: a soft implementation can gain prompts,
evaluations, hybrid paths, and hardened code without changing its operation contract. The Selection
chapter points to the canonical AST as the source for a future projectional editor. Runtime Data
Reflection now precedes Alive UI, separating authority-aware live population and provider
capabilities from the headless interaction planner that consumes them. Events, streams,
operational policy, graph segmentation, adapters, and Living Entities remain explicit directions
rather than current APIs. Every direction carries a compact architectural diagram. All twenty-seven
planned chapters are authored and publication-verified.
The Explorer chapter now also embeds three verified local captures of those reflected surfaces:
the application overview, a relation-rich Entity, and an operation contract. BookOps imports all
three through the book's local-asset pipeline and presents them with its native zoom surface.
The snippet pass now anchors the canonical path to the runnable `todo-express` source, generated
browser projection, and integration suite. It corrected the transport example to show the actual
Selection AST sent over the bridge and closed the only invented canonical operation by adding
`TodoTag.remove` plus a composite-identity integration test. Codegen drift checks, server and
browser typechecking, 18 end-to-end Todo tests, and focused Core, React, PostgreSQL, codegen,
Express, and Explorer tests all pass.
The developer book now also declares the full Ontahi custom theme that previously existed only on
Living Systems. A code-heavy contracts chapter was reimported and visually checked in both light
and dark modes; the theme correctly reaches the reader canvas, navigation, typography, syntax
surfaces, and controls. Mermaid's final integration landed as a generic BookOps renderer change,
not as book-specific diagram CSS.
The final publication pass traversed all twenty-seven chapter routes and matched every rendered heading,
confirmed first/last chapter navigation, reimported with zero warnings, and loaded all three Explorer
captures at their full 1280-pixel source width. At a 390-pixel viewport the reader, navigation drawer,
code surfaces, and chapter chrome remain within the page width; Mermaid keeps its readable canvas in
an internal scroll frame. Mermaid now derives node, edge, cluster, caption, frame, typography, and
light/dark colors from the active BookOps book style. The durable lifecycle and both architectural
maps were visually checked in light and dark mode, and the two wide maps now use top-down layouts.
The linked Todo example sources were verified against the implementation branch and subsequently
integrated into the main Ontahi line. The first edition and its publication slice are complete.

Final reconciliation on 2026-08-12 confirmed that the book is the canonical v1 developer
narrative. Its 27 chapters match the runtime-bound Selection/Query/Command API, the Reference Field
direction, direct Entity operation ergonomics, and the separation between Data Graph execution and
Domain Operation invocation. Atlas now carries these meanings as durable concepts; independent
repository and package publication work does not reopen the book plan.

## Closure / Evolution

Framework gaps discovered during inventory should become narrow linked plans. The first edition is
complete when it teaches the existing canonical model coherently and runs in BookOps; it does not
wait for every future Ontahi abstraction to be finalized. Declarative Entity uniqueness continues
in [`123. Ontahi Declarative Entity Invariants`](ontahi://plans/123-ontahi-declarative-entity-invariants).
Reflected and composition-checked Capability requirements continue in
[`124. Ontahi Capability Dependency Contracts`](ontahi://plans/124-ontahi-capability-dependency-contracts).
Semantic ingress requirements and host resource selection continue in
[`120. Ontahi Environment Resources And Semantic Bindings`](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings).
The Selection AST's projectional editing direction continues in
[`118. Ontahi Selection Language Editor Research`](ontahi://plans/118-ontahi-selection-language-editor),
while semantic operations executed through models continue in
[`125. Ontahi AI Operations`](ontahi://plans/125-ontahi-ai-operations).
Authority-aware live population and provider capability profiles continue in
[`126. Ontahi Runtime Data Reflection`](ontahi://plans/126-ontahi-runtime-data-reflection), while
their headless interaction projection continues in
[`117. Alive UI From Reflected Selections`](ontahi://plans/117-alive-ui-from-reflected-selections).
Authorization policy continues in
[`78. First-Class Authorization And Relationship Policies`](bookops://plans/78-first-class-authorization-and-relationship-policies),
while the durable place of requirements and concerns in graph-native composition remains owned by
[`68k. Graph-Native Application Composition Model`](bookops://plans/68k-graph-native-application-composition-model).
