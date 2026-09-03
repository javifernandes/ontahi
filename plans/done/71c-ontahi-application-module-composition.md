# 71c. Ontahi Application Module Composition

Status: done

Canonical ID: `ontahi://plans/71c-ontahi-application-module-composition`

Migrated from: `bookops://plans/71c-ontahi-application-module-composition`
Original path: `plans/done/71c-ontahi-application-module-composition.md`
Source commit: `4b86f3c6`

Parent plan:

1. [71 Ontahi / BookOps Semantic Model Convergence](../done/71-ontahi-bookops-semantic-model-convergence.md)

Source checkpoint:

1. [71b Unified Entity Capability Lift](bookops://plans/71b-unified-entity-capability-lift)

Related plans:

1. [70 First-Class Durable Tasks In Architecture](bookops://plans/70-first-class-workflow-tier-in-architecture)
2. [77 Domain Topology And GraphOS Layers](ontahi://plans/77-domain-topology-and-graphos-layers)
3. [78 First-Class Authorization And Relationship Policies](bookops://plans/78-first-class-authorization-and-relationship-policies)
4. [100 Ontahi Framework Extraction](../done/100-ontahi-framework-extraction.md)
5. [120 Environment Resources And Semantic Bindings](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)

## Summary

Make `ontahi()` the real composition root for both Todo and BookOps before separately redesigning
auth, policies, tasks, resources, or other application capabilities.

The structural goal is one application declaration that:

1. knows every semantic entity before storage and reflection bind,
2. binds modular operations only after the application facade exists,
3. builds the Graph API from those same modules,
4. does not require entity modules to import a global `app`,
5. preserves existing BookOps capabilities through an explicit transitional boundary.

## Problem

BookOps currently initializes in three passes:

```text
architecture.ts creates and globally registers app
  -> entity modules import app and bind operations
  -> data/graph/api.ts imports and manually enumerates the bound entities again
```

This prevents the unified `ontahi()` root from receiving entities up front: importing the existing
entity modules from the root would require those modules to import the root's `app` before it has
finished initializing.

Moving auth, requirements, concerns, task runtimes, or resources individually does not solve this
cycle. It would create several new design lines while BookOps still used the legacy composition
model.

## Core Model

Treat every application entity as a module with two phases:

1. a semantic entity declaration available without an application,
2. a deferred bind step that receives the completed application facade.

Research shape:

```ts
const Book = entityModule({
  entity: BookEntity,
  bind: app =>
    app.graph.defineEntity(BookEntity, {
      domainOperations: defineBookOperations(app),
    }),
});

const application = ontahi({
  storage,
  entities: [Book, Profile, ContentNode],
  capabilities: bookopsCapabilities,
});
```

The current unified `entity({ fields, operations })` declaration is already conceptually this
two-phase module. `entityModule(...)` is a migration bridge for large existing operation modules,
not a second permanent entity model.

## Capability Boundary

BookOps must initially preserve:

1. auth helpers,
2. requirements and concerns,
3. custom operation errors,
4. effectors,
5. layer defaults,
6. task executor and storage selection,
7. request-scoped Supabase runtime options.

Do not redesign those capabilities in this slice. However, do not hide the entire legacy
`architecture(...)` object behind an untyped `options` bag either.

The proof should identify a typed application-capability extension boundary that:

1. is available to deferred entity binders,
2. cannot replace Ontahi-owned graph/storage/entity composition,
3. keeps each namespace visible for later refinement,
4. permits BookOps to migrate before each namespace has its final abstraction.

## Execution Slices

### Slice 1: Core Module Protocol

- [x] Extract the two-phase entity-module protocol already implicit in unified `entity()`.
- [x] Allow a legacy schema plus deferred binder to implement that protocol.
- [x] Make `ontahi()` prepare semantic entities, bind storage, then bind modules exactly once.
- [x] Build the returned Graph API from the bound module record.
- [x] Prove mixed unified entities and migration modules compose together.

### Slice 2: Typed Capability Extension

- [x] Inventory the exact BookOps facade namespaces required during module binding.
- [x] Add the smallest typed extension boundary to `ontahi()`.
- [x] Keep graph, storage, entities, and task composition owned by `ontahi()`.
- [x] Prove a custom auth or requirement helper is visible inside a deferred binder.

### Slice 3: BookOps Root Migration

- [x] Replace the legacy `architecture(...)` composition root.
- [x] Convert operation-bearing entity modules to deferred binders without redesigning operations.
- [x] Remove global `app` imports from migrated entity modules.
- [x] Remove the manual `BookopsDataGraphApi` entity registry.
- [x] Let storage/reflection receive the same semantic entity set.
- [x] Preserve ingress, Explorer, task, codegen, and runtime behavior.

### Slice 4: Runtime-Target Projections

- [x] Preserve browser-safe entity schema metadata in the application analysis model.
- [x] Resolve that metadata through deferred binder imports, not only inline unified declarations.
- [x] Generate local browser entity schemas with fields, display, freshness, locators, and identity.
- [x] Stop the generated Book client projection from importing the server-owned `BookEntity`.
- [x] Expose sibling entity commands and application capabilities cleanly to unified entity
      declarations.
- [x] Replace the final `BookModule` migration binder with a root-owned `Book = entity(...)`
      declaration.
- [x] Remove the legacy relation-decorated `BookEntity` schema projection after replacing
      `BookWithLabels`, `BookWithCollaborators`, and `BookWithProgress`.
- [x] Move browser consumers of semantic entity identity to the generated runtime projection.

This slice establishes codegen as a runtime projection compiler rather than a bridge-operation
printer. The analyzed application model now carries a serializable semantic entity projection.
The browser renderer materializes that projection with the browser-safe data-graph primitives, so
generated client entities no longer need to import the server declaration merely to preserve
identity and locator behavior.

`Book` is the first proof: its generated client surface owns a local `BookSchema` containing its
fields, display metadata, freshness version, locators, and identity. The remaining `BookModule`
binder is now a server composition problem, not a browser dependency. Removing that binder cleanly
requires the unified `entity()` operation context to type application capabilities and the
pre-bound sibling entity catalog; those are the next two framework seams rather than reasons to
reintroduce a shared server/browser schema file.

Unified declarations can now name their application dependencies:

```ts
const Book = entity({
  uses: {
    capabilities: { require: { authRequired } },
    entities: { BookSource },
  },
  operations: ({ app, commands, entities, values, operations }) => ({
    // ...
  }),
});
```

Ontahi resolves the entity dependencies from the catalog pre-bound during the first composition
pass. The callback receives the concrete capability facade, its own commands, sibling commands,
bound values, and late-bound sibling operations. `BookModule`, `bindBook`, the manual binding
context type, and the custom module wrapper are therefore gone.

The relation debt is now removed without introducing a premature view abstraction. The canonical
`Book` declaration owns its has-many relations and names each target foreign-key field explicitly,
for example `relation.hasMany(BookLabel, { via: 'bookId' })`. Mapping conventions infer the
one-to-many physical mapping from that declaration, and `relatedTo(...)` can traverse a relation
owned by either side of the selection. This removes `BookWithLabels`, `BookWithCollaborators`,
`BookWithProgress`, the duplicate legacy `BookEntity`, and inverse `book` relations that existed
only to make traversal possible.

Consumer-specific result shapes remain selections. First-class graph views may later provide named,
composable, read-oriented projections, but their mutability and runtime semantics are deliberately
outside this bootstrap slice.

The first BookOps root proof now uses `ontahi()` with its existing capability namespaces, task
runtime selection, graph runtime, and lazy reflected-data reader. The manual Graph API remains
temporarily authoritative while entity modules migrate. This proof exposed and fixed runtime type
erasure in the simple root: graph read options, command options, and persistence errors now flow
from the concrete storage runtime into the application facade rather than widening to `any`.

The first incremental module proof uses `ContentNode`. Importing the entire domain module from the
application root proved invalid because its repository dependencies eventually reference the
application again. Ontahi therefore now owns a live Graph API registry: a domain module may register
after the root exists, and the same application catalog immediately exposes the entity and its
operations. Storage bindings receive the cumulative semantic entity set as modules arrive.

`registerBoundEntity(...)` preserves the current BookOps module body during migration and is not a
target authoring API. Codegen now unwraps that transitional registration to analyze the underlying
`app.graph.defineEntity(...)` declaration.

The separately constructed `defineGraphApi(...)` has been removed. BookOps now batch-registers its
remaining legacy bound entities into `bookopsApplication` and exports that same live graph:

```ts
export const BookopsDataGraphApi = bookopsApplication.registerBoundEntities({
  Book,
  Profile,
  // shrinking migration inventory
});
```

Codegen understands this transitional batch as an application declaration. `ContentNode`
independently registers first and the batch recognizes the identical binding rather than creating a
second entry. The remaining object is now only a shrinking module-loading/codegen inventory, not a
second runtime catalog.

`ReadingProgress` is the first operation-bearing BookOps entity to complete the deferred path. Its
domain module exports a semantic declaration plus binder, the application root owns that module up
front, and consumers use the bound entity exposed by `bookopsApplication.graph.entities`. The
transitional batch still mentions the module only so the current static codegen analyzer can see
the complete inventory; runtime registration recognizes the already-bound declaration and does not
create a second graph entry.

This proof also tightened two framework seams:

1. `entityModule(...)` may wrap a unified `entity(...)` declaration while preserving its lazy
   relation preparation and replacing only the binder.
2. Codegen recognizes callback-form `domainOperations` on deferred low-level binders, which keeps
   Book operations and tasks visible while modules migrate.

`CommentMessage` and `CommentMessageReaction` now provide the first support-entity proof: the root
owns their semantic declarations and selection bindings, repositories consume the root-owned bound
commands through the existing compatibility export, and neither entity remains in the manual Graph
API batch.

Trying the same move on relation-bearing records and `NotificationDelivery` exposed a protocol
boundary: a deferred module declared outside the concrete application widened its graph runtime
type, while explicitly repeating the BookOps runtime caused TypeScript's instantiation depth to
overflow.

The root now distinguishes unified semantic declarations from custom migration binders. For
`entity()` declarations it materializes the bound selection/operation surface against the concrete
storage runtime at `ontahi()` composition time. Custom binders retain their explicit return type.
This removes the need for selection-only wrappers and preserves concrete read/command errors and
options without eagerly expanding relation types inside the module declaration.

`BookLabel`, `BookSource`, `BookCollaborator`, `Profile`, `ContentTranslation`,
`SupportedLanguage`, `NotificationDelivery`, and `CommentMessage` now enter the root directly as
unified declarations. `CommentMessageReaction` remains a small migration module because its schema
still uses the low-level entity constructor.

`TaskRun` is the first server/bridge operation module to complete the deferred path. Its binder
receives BookOps capabilities, imports the configured task storage directly instead of importing
the global architecture, and the root exposes the bound operation entity. Codegen now unwraps
`entityModule({ bind })`, preserving `TaskRun.getMine` and its bridge query metadata while the
transitional static inventory remains.

`ContentNode` now proves the broader binder case. `entityModuleWithCapabilities(...)` separates the
minimal application capability selector from the binder itself: the module names only the
`require`, `concern`, and `runtime` functions it consumes and never references the fully inferred
BookOps application type. Its binder also publishes an explicit bound-entity output contract, so
TypeScript does not recursively infer the operation body through the application root. Book
ownership is exposed through the existing `runtime` namespace rather than through a global
architecture import. The root now owns `ContentNode`, codegen still discovers
`evaluateExerciseSubmission`, and the application type remains concrete.

`GitHubAppInstallation` is the next capability-bound module owned by the root. Its binder selects
only auth and requirement capabilities, while GitHub record queries are constructed from the
entity selection commands instead of importing the global application. A compatibility records
module delegates to the root-owned entity for the still-legacy Book binder. This preserves all
bridge operations and the GitHub webhook ingress while removing another eager application import
from entity declaration.

`UserNotification` now enters through the same root-owned protocol. Its binder selects auth plus a
cohesive notification runtime capability rather than importing conversation repositories and the
digest job directly. The capability keeps those Effects typed while loading their implementation
behind application bootstrap; the digest job itself now uses Ontahi's warning reporter directly.
Codegen follows local operation-map factories, preserving all notification bridge contracts without
forcing large binders to inline their operations solely for static analysis.

The deferred protocol now also supports graph relations. `relationModule(...)` and its
capability-selecting variant contribute a bound relation to the application catalog while
contributing no fake entity to storage. Core tests prove that source and target entities are bound
physically while the relation remains a Graph API surface, and codegen preserves operations behind
the deferred relation binder. This removes the structural blocker for migrating
`BookCollaborators` without pretending it owns a table.

The remaining transitional registry is now only `Book`. Once that declaration is root-owned,
`BookopsDataGraphApi.registerBoundEntities(...)` can collapse to the graph returned directly by
`bookopsApplication`.

Sharing migration first removed two accidental application service locators. `shared.ts` now uses
Ontahi operation primitives and BookOps auth requirements directly rather than re-exporting pieces
of the global `app`. Sharing record queries are now constructed from injected entity commands;
`records.ts` remains a compatibility facade over root-owned commands while legacy Book and Invite
consumers migrate. This leaves loaders/effects as the final dependency boundary before
`BookCollaborators` and `PendingCollaboratorInvite` can enter the root.

Invite loaders and acceptance effects now have a bootstrap-safe runtime core. `BookCollaborators`
is a real relation module and `PendingCollaboratorInvite` is a real entity module; both receive
their graph commands during binding and are owned by the application root. Book lookup is derived
from the binder's `Book` selection commands rather than dynamically importing the global
architecture. Existing compatibility records remain for the still-legacy `Book` module, while
codegen's transitional static inventory names the two modules without rebinding them at runtime.

`CommentThread` is now root-owned as well. Its migration exposed several hidden module-evaluation
cycles through conversation repositories, content read models, and the audience graph view.
Conversation persistence and projection Effects now cross a lazy runtime boundary, while the
audience graph contract has a bootstrap-safe type/conversion module. Operation behavior and
codegen metadata remain unchanged; the root no longer evaluates Book and Sharing compatibility
records while composing the thread module.

`Book` completes the root migration. Its binder constructs selection commands and sharing queries
from the application it receives, while content, search, and persistence implementations cross a
lazy runtime boundary instead of importing the global application during bootstrap.
`BookopsDataGraphApi` is now exactly `bookopsApplication.graph`; the transitional
`registerBoundEntities(...)` inventory is gone, and codegen analyzes `architecture.ts`, the same
composition root the server executes.

The final binder also exposed a static-analysis constraint hidden by the smaller modules: a
realistic binder prepares local operations and returns a locally named entity declaration.
Codegen now carries function-local declarations while resolving deferred binders, so durable task
metadata remains discoverable without forcing operations or `defineEntity(...)` inline. The
generated GitHub Markdown task registry and Vercel workflow remain intact.

The first post-migration simplification removes low-level cross-entity binding from modules.
`ontahi()` now pre-binds selection commands for the complete semantic entity set before binding any
module, and deferred binders receive that catalog as `{ entities }`. Binding is therefore
independent of declaration order, and the Book module consumes `entities.BookSource`,
`entities.Profile`, `entities.BookCollaborator`, and the other root-owned entities directly.
Derived relation views remain outside this catalog until their query/relation model is lifted in
the next slice.

Book no longer assembles GitHub or sharing record-query factories during binding. Its operations
query the pre-bound `entities.*` catalog directly, and the supposedly required
`BookWithCollaborators` derived-view binding proved to be unused wiring and was removed. This
separates remaining query-expression verbosity from application composition: projections may
still deserve a smaller query language, but they no longer require repository/factory assembly in
the entity binder.

Domain-operation callbacks now receive a late-bound `operations` catalog. Operation closures can
invoke a sibling through its final resolved declaration regardless of declaration order, while
reading that catalog eagerly during binding fails clearly. Book uses this to dispatch
`internalImportFromGithubMarkdown` from its public import and webhook operations; the previous
predeclared operation, global getter, and unsafe resolved-operation cast are gone.

### Slice 4: Validation And Routing

- [x] Run graph API contract tests for the first root-owned operation module.
- [x] Run representative auth, requirement, concern, task, relation-root, and operation tests.
- [x] Validate BookOps and Todo through their focused application, codegen, runtime, React, and
      integration suites; the independent Todo guide retains the manual first-run path.
- [x] Absorb migration binders into the final `entity()` composition surface and remove
      application use of `entityModule(...)`.
- [x] Route each remaining capability weakness to a focused follow-up plan.

`CommentMessageReaction` and `ReadingProgress` now use the final unified declaration directly.
Their migration removed two more application binders and exposed two final surface gaps:

1. `entity()` now accepts graph and domain operations in the same `operations` collection and
   classifies them internally by declaration kind.
2. Entity-level exposure is part of the unified declaration, and browser codegen projects
   schema-only entities needed by relations without importing their server declarations.

`ReadingProgress` is the proof: its browser-direct graph operations, entity exposure, fields, and
relationship participation are declared once, while the browser target receives a local
`ReadingProgressSchema`.

`CommentMessageReaction` and `PendingCollaboratorInvite` now provide the same proof for a
schema-only entity and a domain-operation-heavy entity. The invite migration exposed a mutual
declaration cycle with `Book`: lazy `uses.entities` removes evaluation-order coupling, while a
shared semantic schema witness lets Book resolve invite commands by entity identity without
registering a second public entity. This witness is deliberately transitional; a first-class
semantic entity link/reference should eventually express cyclic declaration dependencies without
duplicating a schema declaration.

Browser projection now follows referenced field constants across module boundaries and inlines
their value. Shared field definitions therefore remain single-source without making generated
browser code import server declaration modules.

`TaskRun` is also a unified entity now. This remains an application-owned declaration only as a
transition: the semantic TaskRun entity and its standard operations should ultimately be supplied
by Ontahi itself, while applications select task execution and storage capabilities.

Browser-direct reflection now follows the same projection rule. Explorer asks the configured
client runtime whether it can invoke a reflected operation; registered browser graph operations run
through the graph executor, while bridged domain and durable operations keep using the HTTP
fallback. `ReadingProgress.resetReadingProgress` is the first proof: its reflected input is a
one-cardinality `ReadingProgress` selection with composite identity, and its implementation is only
`progress.delete()`.

This also clarifies the boundary between graph primitives and named operations. A named operation
should add domain meaning: policy, invariants, authorization, coordination, side effects,
idempotency, or a stable reusable intention. Pure create/update/delete behavior over an already
expressible selection belongs to the ubiquitous graph surface (`selection.delete()`,
`selection.update(...)`) and should not require an endpoint-shaped wrapper. The existing reset name
remains as a compatibility alias while direct selection commands become usable from application
code and Explorer.

Entity display metadata now admits one-hop `belongsTo` paths such as `book.title` and
`reader.displayName`. Reflected readers hydrate those presentation values with one batched `in`
read per relation, and Explorer renders them without adding denormalized persistence fields.
`ReadingProgress` is the first proof. Relational free-text search remains deliberately separate:
its current search fields stay local (`bookId`, `userId`) until storage planning can translate
related display searches without partial client-side filtering.

`GitHubAppInstallation` now owns its schema, capabilities, persistence commands, ingress, and
operations in the unified declaration as well. The unused global `github/records.ts` compatibility
surface was deleted. Its operations now pass their own `commands` surface to local record-query
helpers; the former same-name schema witness and self-directed `commandsFor(...)` call are gone.
The helper's static shape comes from `OntahiEntityContract` over the same field fragment consumed
by the single real declaration.

Recursive semantic relations now have a first-class nominal reference. Entities can declare
`entity.ref('OtherEntity')` without importing the target module, and `ontahi()` resolves every
relation and `uses.entities` reference against the complete application catalog before storage or
operations bind. BookOps proves the cycle with `Book.pendingInvites` and
`PendingCollaboratorInvite.book`; declaration order no longer matters and missing targets fail
during composition.

Nominal references intentionally do not pretend to expose a recursively inferred TypeScript
operation surface. Direct entity relations remain fully typed, while name-based cyclic relations
are reflected and executable at runtime. Browser codegen recognizes the same references and emits
cyclic schema links in a second phase after all schemas exist.

The command-shape witness is removed too. `entity.ref(name, { fields, locators })` carries a static
`OntahiEntityContract` for `commandsFor(...)` while resolving the runtime entity solely by its
registered semantic name. Book therefore queries pending invites without importing either the
invite declaration or a duplicate schema. Shared fields and locators are fragments consumed by the
single real entity declaration; mappings and compatibility records now use the root-owned bound
entity directly.

`UserNotification` is unified too. Its notification runtime and auth requirements are declared as
capabilities, application records use the root-bound entity, and browser consumers use the
generated schema projection instead of importing the server declaration. The former same-name
server schema witness is gone: operations author selections against their bound `self`, while
repositories accept a `SemanticSelection<'UserNotification'>` and re-root it onto their record
projection. Selection compatibility is therefore based on semantic entity identity rather than
JavaScript object identity. `NotificationDelivery` keeps typed relation traversal through
`entity.ref(name, { fields, locators })`, without introducing another runtime entity declaration.

`ContentNode` now uses the unified declaration as well. The historical
`application -> ContentNode -> repository/read model -> application` inference cycle is cut by a
narrow `ExerciseRuntimeCapability`: the entity retains validation, authorization, rate limiting,
error mapping, and use-case orchestration, while host composition supplies lazy repository and AI
implementations. Codegen emits a local `ContentNodeSchema` for browser consumers, and server
consumers use the one root-owned entity.

The migration also separated two kinds of locator. `refById` remains entity identity, while the
route-shaped `bookSlug/partSlug/chapterSlug` resolver is now declared only on the operation inputs
that accept it via `refInput(...).by(...)`. It is no longer represented as a global entity locator
through an `Object.assign` metadata function.

`CommentThread` exposed the other remaining composition limit. Its large operation family cannot
be expanded structurally through the application root without making TypeScript recursively infer
repository, Effect, capability, and operation implementation details. `operationGroup(...)` now
provides an explicit public-name boundary: runtime binding validates that the declared names match
the implementation, the root sees only the bounded operation catalog, and codegen follows the
opaque factory to retain each concrete browser contract. The boundary deliberately prevents the
server root from using implementation-inferred input/result types; generated runtime projections
remain the consumer-facing typed surface.

With that boundary, `CommentThread` and the schema-only `CommentMessage` are both ordinary unified
entities. The former owns fields, freshness, locators, identity, and its complete operation group;
the latter proves that codegen projects a registered entity even when it has no operations. The
old `data/graph/schema.ts`, `CommentThreadModule`, and same-name schema witnesses are gone.
Conversation result contracts keep browser-safe field fragments, while explicit graph-output
metadata uses the operation context's real `self` entity. Codegen rewrites referenced semantic
entities to their generated browser schemas, preserving normalized cache behavior without a
shared server/browser entity object.

The final portability gate also restored the intended selection-input split. Public operation
contracts expose the semantic, serializable selection shape, while operation implementations see a
hydrated semantic selection with command methods such as `update(...)`. The type carries entity
fields without requiring the caller and server to share the same JavaScript entity object, so the
Todo example keeps its compact `todos.update(...)` handler and BookOps can use equivalent
same-name entity projections safely.

## Gates

This slice is complete only when:

1. Todo and BookOps both use `ontahi()` as their application root,
2. BookOps has no separately maintained Graph API entity list,
3. entity modules do not depend on a globally initialized application,
4. storage mappings, reflection, ingress, and Explorer observe the same application entity set,
5. auth/tasks/resources can evolve later without reopening application initialization,
6. `entityModule(...bind...)` remains at most an internal migration mechanism, not application API
   or documented authoring style.

## Non-Goals

1. Do not finalize auth or authorization semantics.
2. Do not finalize relation-owned behavior.
3. Do not redesign task execution or storage.
4. Do not solve multi-storage resource bindings.
5. Do not migrate every operation to the compact inline entity syntax.
6. Do not preserve legacy architecture registration as a hidden second composition root.

## Closure

- Status: done
- Closed on: 2026-08-08
- Effective effort: multi-branch implementation; exact focused time unknown
- Landed shape: `ontahi()` is the single composition root for Todo and BookOps; unified entity
  declarations own semantic schema, relations, operations, dependencies, and runtime binding;
  storage, reflection, codegen, React, Explorer, and operation invocation observe that same model.
- Final branch: `feature/ontahi-semantic-entity-refs`
- Follow-ups:
  - [`122-ontahi-developer-book.md`](./122-ontahi-developer-book.md)
  - [`78-first-class-authorization-and-relationship-policies.md`](bookops://plans/78-first-class-authorization-and-relationship-policies)
  - [`119-selection-relation-predicates`](ontahi://plans/119-selection-relation-predicates)
  - [`120-ontahi-environment-resources-and-semantic-bindings`](ontahi://plans/120-ontahi-environment-resources-and-semantic-bindings)

The composition problem this plan set out to solve is closed. Standard runtime-owned entities such
as `TaskRun`, narrower capability vocabulary, relation-owned behavior, and developer learning
materials are separate evolutions; keeping them here would turn a completed intervention into a
permanent Ontahi backlog.
