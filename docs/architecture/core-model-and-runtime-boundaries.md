# Core Model And Runtime Boundaries

This document records the slice 1 inventory and boundary proposal for
[Plan 171](../../plans/current/171-core-model-and-runtime-boundaries.md). It describes the current
source tree; it does not authorize a repository-wide move or make internal paths public API.

## Classification rubric

Every production module below has one primary owner category and an intended destination. The
categories answer who owns the meaning of a module, not merely where it happens to execute today.

| Category             | Test                                                                                                           | Allowed contents                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Portable model       | Would the concept retain its meaning with no client, server, transport, storage engine, or execution strategy? | Identity-bearing declarations, portable constraints, references, relations, operations, queries, selections, views, and descriptors. |
| Computation          | Does the module transform or plan portable values without owning identity or performing I/O?                   | Lowering, evaluation, normalization, assembly, and planning.                                                                         |
| Runtime              | Does the module execute, dispatch, observe, cache, transact, or bind portable declarations?                    | Runtime ports, dispatchers, protocol codecs, caches, and execution coordination.                                                     |
| Adapter              | Does the module implement a runtime port with a concrete strategy or environment?                              | In-memory storage/execution and remote runtime implementations.                                                                      |
| Compatibility facade | Does the module exist primarily to preserve a supported import surface?                                        | Re-exports only; no new domain behavior.                                                                                             |
| Unresolved           | Does one file own concepts from more than one category or depend in the wrong direction?                       | Temporary classification requiring a focused split before movement.                                                                  |

Tests remain colocated with the behavior they verify. `fixtures.test-support.ts` follows the Entity
model test surface but is not production API. A destination below is conceptual: later slices must
confirm names and compatibility exports before moving a file.

## Module inventory

The inventory covers all 87 non-test TypeScript modules currently under `src/data-graph` (including
the one test-support module). Modules sharing a row have the same owner and destination.

| Current module(s), relative to `packages/core/src/data-graph/`                                                                                                                                     | Owner                       | Intended destination                                                            | Notes                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authority.ts`                                                                                                                                                                                     | Portable model              | `model/operation/authority.ts`                                                  | Portable execution authority vocabulary, not authority enforcement.                                                                                               |
| `definitions.ts`                                                                                                                                                                                   | Unresolved                  | Split across `value/schema/`, `model/entity/`, and `model/relation/`            | Still contains value schemas, Entity construction, and view composition. Model contracts and physical mapping computations are now re-exports.                    |
| `mapping-conventions.ts`                                                                                                                                                                           | Portable model              | `model/entity/mapping-conventions.ts`                                           | Logical-to-physical mapping declarations; concrete SQL projection remains adapter-owned.                                                                          |
| `reference-field.ts`                                                                                                                                                                               | Computation                 | `computation/entity-reference/lowering.ts`                                      | Storage-boundary identity checks and selection lowering remain here; Reference Field declarations now live in `model/entity/reference-field.ts`.                  |
| `ref/identity.ts`                                                                                                                                                                                  | Compatibility facade        | Retain legacy re-export                                                         | Identity selection and materialization now live in `model/entity/ref/identity.ts`; the historical path owns no behavior.                                          |
| `ref/schema-reference.ts`                                                                                                                                                                          | Compatibility facade        | Retain legacy re-export                                                         | Schema reference declarations, resolution, and validation now live in `model/entity/ref/schema-reference.ts`.                                                     |
| `ref/model.ts`                                                                                                                                                                                     | Compatibility facade        | Retain legacy re-export                                                         | The portable implementation and its behavior tests now live in `model/entity/ref/model.ts`; the historical path owns no behavior.                                 |
| `ref/input.ts`, `ref/variant-input.ts`                                                                                                                                                             | Portable model              | `model/entity/ref/`                                                             | Portable reference input vocabulary.                                                                                                                              |
| `ref/input-normalization.ts`, `ref/binding.ts`                                                                                                                                                     | Computation                 | `computation/entity-ref/`                                                       | Normalize or bind portable references; no runtime ownership.                                                                                                      |
| `ref/index.ts`                                                                                                                                                                                     | Compatibility facade        | `model/entity/ref/index.ts`, with legacy re-export                              | Existing ref barrel.                                                                                                                                              |
| `relation-constraint.ts`, `relation-root.ts`                                                                                                                                                       | Portable model              | `model/relation/`                                                               | Portable relation constraints and relation-root read semantics.                                                                                                   |
| `reflected-related-entity-data.ts`                                                                                                                                                                 | Portable model              | `model/relation/reflection.ts`                                                  | Shape of reflected relation data, independent of its reader.                                                                                                      |
| `relationship-command.ts`, `relationship-command-result.ts`                                                                                                                                        | Portable model              | `model/relation/command.ts` and `result.ts`                                     | Command intent and result vocabulary. Executor declarations should become runtime ports when split.                                                               |
| `relationship-command-affordance.ts`                                                                                                                                                               | Portable model              | `model/relation/affordance.ts`                                                  | Portable authoring/discovery metadata.                                                                                                                            |
| `entity-mutation-affordance.ts`, `entity-mutation-authoring.ts`                                                                                                                                    | Portable model              | `model/entity/mutation/`                                                        | Mutation declarations and authoring metadata.                                                                                                                     |
| `entity-mutation-command.ts`                                                                                                                                                                       | Unresolved                  | Split between `model/entity/mutation/command.ts` and `runtime/entity-mutation/` | Combines portable command/result shapes with execution helpers.                                                                                                   |
| `entity-variant-contract.ts`, `entity-variant.ts`                                                                                                                                                  | Portable model              | `model/entity/variant/`                                                         | Variant declarations, discriminators, and contracts.                                                                                                              |
| `variant-binding.ts`                                                                                                                                                                               | Computation                 | `computation/entity-variant/binding.ts`                                         | Binds variant selections/queries.                                                                                                                                 |
| `entity-selections.ts`, `contextual-selection-factories.ts`                                                                                                                                        | Portable model              | `model/query/selection/`                                                        | Entity selection declarations and contextual factories.                                                                                                           |
| `selection-ast.ts`                                                                                                                                                                                 | Compatibility facade        | Retain legacy re-export                                                         | Selection AST values, composition, copying, and semantic-selection contracts now live in `model/query/selection-ast.ts`.                                          |
| `selection-value.ts`, `selection-relations.ts`                                                                                                                                                     | Portable model              | `model/query/selection/`                                                        | Remaining selection authoring and relation semantics.                                                                                                             |
| `selection.ts`, `selection-factories.ts`                                                                                                                                                           | Portable model              | `model/query/selection/`                                                        | Selection authoring API.                                                                                                                                          |
| `selection-budget.ts`                                                                                                                                                                              | Portable model              | `model/query/selection/budget.ts`                                               | Portable complexity constraint used at protocol boundaries.                                                                                                       |
| `selection-assembly.ts`                                                                                                                                                                            | Computation                 | `computation/query/selection-assembly.ts`                                       | Builds semantic selection results from declarations.                                                                                                              |
| `query.ts`, `view-query.ts`                                                                                                                                                                        | Portable model              | `model/query/`                                                                  | Query declarations and query/view composition semantics.                                                                                                          |
| `view.ts`                                                                                                                                                                                          | Compatibility facade        | Split facade and legacy schema overload                                         | Recursive View AST, inference, validation, and construction live in `model/query/view.ts`; only the Graph-schema overload remains at the historical boundary.     |
| `planning.ts`                                                                                                                                                                                      | Computation                 | `computation/query/planning.ts`                                                 | Lowers portable selections into an adapter-neutral query plan.                                                                                                    |
| `model-expression/builder.ts`, `model-expression/condition.ts`, `model-expression/derived-field.ts`                                                                                                | Portable model              | `model/expression/`                                                             | Remaining expression declarations and authoring helpers.                                                                                                          |
| `model-expression/program.ts`                                                                                                                                                                      | Compatibility facade        | Retain legacy re-export                                                         | The portable program representation and behavior tests now live in `model/expression/program.ts`.                                                                 |
| `model-expression/evaluator.ts`                                                                                                                                                                    | Computation                 | `computation/expression/evaluator.ts`                                           | Pure evaluation of model expressions.                                                                                                                             |
| `model-expression/index.ts`                                                                                                                                                                        | Compatibility facade        | `model/expression/index.ts`, with legacy re-export                              | Existing expression barrel.                                                                                                                                       |
| `client-input.ts`                                                                                                                                                                                  | Computation                 | `computation/input/normalization.ts`                                            | Maps model schemas and selections to client input and normalizes values.                                                                                          |
| `schema-descriptor.ts`                                                                                                                                                                             | Portable model              | `value/schema/descriptor.ts`                                                    | Serializable schema description without Entity identity.                                                                                                          |
| `schema.ts`                                                                                                                                                                                        | Computation                 | `value/schema/parsing.ts`                                                       | Parsing and validation for portable schema declarations.                                                                                                          |
| `operation-input.ts`                                                                                                                                                                               | Portable model              | `model/operation/input.ts`                                                      | Operation input schema attachment.                                                                                                                                |
| `operation-execution.ts`                                                                                                                                                                           | Portable model              | `model/operation/execution-policy.ts`                                           | Retry, capability, and affordance declarations; an engine belongs in runtime.                                                                                     |
| `operations.ts`                                                                                                                                                                                    | Unresolved                  | Split across `model/operation/`, `model/query/`, and `runtime/operation/`       | A 1,606-line mixture of operation declarations, application metadata, cache hints, and runtime-bound helpers.                                                     |
| `output/index.ts`                                                                                                                                                                                  | Portable model              | `model/operation/output.ts`                                                     | Portable output descriptor and authoring API.                                                                                                                     |
| `command.ts`                                                                                                                                                                                       | Portable model              | `model/command/command.ts`                                                      | Graph command intent.                                                                                                                                             |
| `command-binding.ts`                                                                                                                                                                               | Runtime                     | `runtime/command/binding.ts`                                                    | Binds command intent to an Effect-based executor.                                                                                                                 |
| `command-dispatcher.ts`, `command-protocol.ts`                                                                                                                                                     | Runtime                     | `runtime/protocol/command/`                                                     | Dispatch and wire-family parsing/encoding.                                                                                                                        |
| `read-policy-authoring.ts`, `read-variants.ts`                                                                                                                                                     | Portable model              | `model/query/policy.ts` and `variants.ts`                                       | Portable read policy and variant declarations.                                                                                                                    |
| `read-dispatcher.ts`, `read-protocol.ts`                                                                                                                                                           | Runtime                     | `runtime/protocol/read/`                                                        | Dispatch and wire-family parsing/encoding; portable request DTOs may remain protocol contracts.                                                                   |
| `binding.ts`                                                                                                                                                                                       | Runtime                     | `runtime/query/binding.ts`                                                      | Binds query/view declarations to Effect/Stream executors.                                                                                                         |
| `execution.ts`, `runtime.ts`, `runtime-bound-api.ts`                                                                                                                                               | Runtime                     | `runtime/data/`                                                                 | Runtime ports, executor construction, and runtime-bound API.                                                                                                      |
| `storage.ts`, `transaction.ts`                                                                                                                                                                     | Runtime                     | `runtime/storage/contract.ts` and `runtime/transaction.ts`                      | Storage and transaction capability contracts, not Entity semantics.                                                                                               |
| `client-application.ts`                                                                                                                                                                            | Portable model              | `model/application/client-surface.ts`                                           | Declares which Entities and operations a client application exposes.                                                                                              |
| `client/cache/index.ts`                                                                                                                                                                            | Runtime                     | `runtime/client/cache/`                                                         | Current 973-line cache implementation. Slice 5 should split records/events, normalization, Entity storage, output storage, and reconciliation behind its factory. |
| `client/operation-cache/index.ts`                                                                                                                                                                  | Runtime                     | `runtime/client/operation-cache/`                                               | Operation result cache behavior.                                                                                                                                  |
| `remote-runtime.ts`, `remote-observation.ts`                                                                                                                                                       | Adapter                     | `runtime/client/remote/`                                                        | Remote execution and observation implementations.                                                                                                                 |
| `reflection.ts`                                                                                                                                                                                    | Unresolved                  | Split between `model/reflection/` and `runtime/reflection/`                     | Portable reflection types currently import runtime invocation results, creating a model-to-runtime inversion.                                                     |
| `reaction.ts`, `mutation-reaction.ts`                                                                                                                                                              | Unresolved                  | Split between `model/reaction/` and `runtime/server/reaction/`                  | Portable reaction declarations import server event types; execution, event occurrence, and post-commit work are runtime concerns.                                 |
| `mutation-impact.ts`                                                                                                                                                                               | Portable model              | `model/mutation/impact.ts`                                                      | Serializable semantic mutation facts consumed by runtimes and protocols.                                                                                          |
| `in-memory/storage.ts`, `in-memory/runtime.ts`                                                                                                                                                     | Adapter                     | `runtime/storage/in-memory/`                                                    | Concrete storage and runtime implementation.                                                                                                                      |
| `in-memory/command.ts`, `in-memory/entity-mutation-command.ts`, `in-memory/relationship-command.ts`, `in-memory/ordered-relationship-command.ts`, `in-memory/many-to-many-relationship-command.ts` | Adapter                     | `runtime/storage/in-memory/command/`                                            | Concrete mutation execution.                                                                                                                                      |
| `in-memory/query.ts`, `in-memory/selection.ts`, `in-memory/materialization.ts`, `in-memory/reflected-entity-data.ts`, `in-memory/observation.ts`                                                   | Adapter                     | `runtime/storage/in-memory/read/`                                               | Concrete reads, result materialization, and observation.                                                                                                          |
| `index.ts`                                                                                                                                                                                         | Compatibility facade        | Retain `data-graph/index.ts` during migration                                   | Package-root and `@ontahi/core/data-graph` compatibility re-exports. It must not gain new semantics.                                                              |
| `fixtures.test-support.ts`                                                                                                                                                                         | Portable model test support | Follow `model/entity/` tests                                                    | Not production API; move only with the Entity test surface.                                                                                                       |

## Current dependency map

The map is at conceptual-group granularity. A solid arrow is the intended direction; a dashed arrow
marks a current inversion or a mixed-owner dependency that must be cut before movement.

```text
value ───────────────▶ model ◀────────────── model/replication
  │                     │
  └────────▶ computation│
               ▲       │
               └───────┘
                       ▼
              runtime contracts/protocols
                 │        │
                 ▼        ▼
          client/remote  storage/in-memory

current inversions:
  data-graph/reflection       - - -▶ runtime/contracts
  data-graph/reaction         - - -▶ runtime/server/events
  data-graph/mutation-reaction- - -▶ runtime/server/events
  runtime/*                   ─────▶ portable and runtime-owned data-graph modules
```

The last edge is not intrinsically wrong: runtime should consume portable models. It is currently
opaque because both portable declarations and runtime machinery are exported from the same
`data-graph` barrel. The first three edges are true direction inversions. They also form the risk of
future cycles as runtime already imports `reflection`, reaction-related mutation types, and most
portable graph declarations.

Large mixed modules are dependency hubs rather than acceptable boundaries. The initial hotspots are
`definitions.ts` (1,754 lines), `operations.ts` (1,606), `selection-assembly.ts` (1,082),
`client/cache/index.ts` (973), `command-protocol.ts` (882), `read-dispatcher.ts` (812), and
`schema-descriptor.ts` (805). Line count is not the classification rule, but it makes a mixed owner
costly to review and easy to depend on accidentally.

## Allowed dependency directions

1. `value` depends only on other value modules and technology-neutral third-party value libraries.
2. `model` may depend on `value`; it must not depend on `runtime`, clients, servers, transports,
   storage engines, or concrete adapters.
3. `computation` may depend on `value` and portable `model` contracts. Model declarations must not
   depend on computation engines, except for deliberately tiny authoring builders exposed as model
   API.
4. `runtime` may depend on `value`, `model`, and `computation`. Runtime contracts must not import a
   concrete adapter.
5. Adapters may depend on runtime contracts and all portable layers. One adapter must not depend on
   another adapter.
6. Compatibility facades may re-export any supported surface but own no behavior. Portable modules
   must never import a compatibility facade.
7. Cross-boundary DTOs are owned by the boundary that gives them meaning: protocol envelopes by
   `runtime/protocol`, semantic mutation facts by `model/mutation`, and schema descriptors by
   `value/schema`.

These rules deliberately permit runtime-to-model dependencies and reject the inverse. They do not
require `value`, `model`, and `computation` to become separate packages.

## Proposed target boundaries

```text
src/
  value/
    schema/                 # portable data schemas, descriptors, parsing
  model/
    application/            # portable exposed application surface
    command/                # command intent
    entity/                 # identity, fields, refs, variants, mutation declarations
    expression/             # portable expression/program declarations
    mutation/               # semantic impact facts
    operation/              # declarations, inputs, outputs, policies, affordances
    query/                  # query, view, selection, read policy
    reaction/               # portable reaction declaration only
    relation/               # relation declarations, constraints, commands/results
    replication/            # existing replicated versioned model kernel
  computation/
    entity-ref/             # normalization and binding
    expression/             # pure evaluator
    input/                  # client-input normalization
    query/                  # planning, selection assembly, variant binding
  runtime/
    client/
      cache/
      operation-cache/
      remote/
    command/
    protocol/
      command/
      read/
    query/
    reflection/
    server/
      reaction/
    storage/
      contract.ts
      in-memory/
    data/
    transaction.ts
  data-graph/               # temporary compatibility facade; no new ownership
```

This shape is a destination map, not a move order. In particular, `definitions.ts`, `operations.ts`,
reflection, and reactions must be split at their semantic seams before their old files become
facades. Moving either large file unchanged would reproduce `data-graph` under a new name.

## Compatibility and sequencing

- Keep package-root exports and the documented `@ontahi/core/data-graph` export intact throughout
  extraction. New internal destinations can be introduced behind those exports.
- Do not promise compatibility for undocumented source-file paths. Repository consumers should be
  migrated to package exports before the old implementation files disappear.
- Start slice 2 with the Entity kernel inside `definitions.ts`: value-schema primitives are a
  prerequisite seam, while relations, views, and physical mapping can remain behind the facade.
- Treat `model/replication` as evidence for the portable-model rule, not as a template that forces
  runtime materializers into the model layer. Its current runner should be re-evaluated when runtime
  boundaries reach replication.
- Defer cache decomposition, in-memory relocation, and Zod disposition to their dedicated slices.
- The Slice 6 audit found that `model/zod` contains only generic value-validation helpers, with no
  internal model consumers. `value/zod` is now their owner and public destination;
  `model/zod` remains a deprecated compatibility facade. Graph-schema Zod projection and
  `contractFromZod` are distinct runtime adapters and are not part of this legacy helper surface.
- Add automated direction checks only after the first real boundary exists; a check against today's
  mixed namespace would either encode known debt or require a broad exception list.

### Slice 7 retirement checkpoint

The extracted boundaries are now large enough to enforce direction without encoding the historical
layout. An executable architecture test scans production sources and rejects these dependencies:

- `value -> model | computation | runtime | data-graph`;
- `model -> computation | runtime | data-graph`;
- `computation -> runtime | data-graph`.

Tests may still import historical paths to prove facade compatibility. Runtime modules may consume
remaining `data-graph` implementation until its query, schema, command, protocol, and execution
seams have direct owners. The retirement audit counts 86 non-test production modules and about
19,500 lines under `data-graph`; at least 21 are explicit compatibility facades. This is not yet a
facade-only directory, so wholesale removal would merge architectural migration with behavioral
rewrites.

As the first cleanup pass, `runtime/client/cache` and `runtime/storage/in-memory` now import the
portable Entity, Ref, Relation, Selection AST, operation-output, and mapping contracts directly.
Imports that remain point to mixed implementations with no complete replacement boundary yet and
form the concrete backlog for the next retirement pass.

## Slice 1 decisions

1. Adopt the dependency directions above as the migration rule.
2. Use `data-graph` only as a temporary compatibility facade and migration source.
3. Treat `definitions.ts`, `operations.ts`, reflection, reactions, and Entity mutation command
   execution as unresolved seams; do not move them whole.
4. Put protocol DTOs and dispatch in runtime, while keeping semantic mutation facts and operation
   declarations portable.
5. Keep in-memory code in Core for now, explicitly owned as a reference adapter. Package extraction
   is a later decision and is not required for a coherent boundary.
6. Begin the implementation migration with the portable Entity kernel, one compatibility-preserving
   slice at a time.

## Slice 4 progress

The reference in-memory implementation now lives under `runtime/storage/in-memory`. Its storage
factory, execution runtime, observation hub, read/materialization implementation, and mutation
command executors move together as one adapter boundary. Historical `data-graph/in-memory` modules
contain re-exports only, so existing package-root and `@ontahi/core/data-graph` consumers preserve
their API while new internal dependencies can recognize the implementation as a concrete runtime
adapter rather than portable model semantics.

## Slice 5 progress

The Graph client cache now lives under `runtime/client/cache`. Its public records and events,
freshness rules, deterministic key and locator normalization, Entity record storage, output record
storage, and complete-snapshot reconciliation are separate internal modules behind the existing
`createGraphClientCache` factory. The historical `data-graph/client/cache` path is a re-export only;
observable cache behavior and package-root exports remain unchanged.

## Slice 2 progress

The first extraction moves Entity reference values, locator values, factories, normalization, and
equality to `model/entity/ref/model.ts`. This unit depends only on `value/object`; the historical
`data-graph/ref/model.ts` path is now a tested compatibility facade. Entity Field contracts,
record/mutation inference, and display/freshness metadata have moved out of `definitions.ts` into
`model/entity`, with type-level compatibility tests through the historical exports. The portable
expression program moved to `model/expression/program.ts` first so derived Field metadata would not
introduce a dependency from the model boundary back to `data-graph`. Structural
`AnyEntityDefinition` now lives in
`model/entity/definition.ts`, while portable Relation definitions, mappings, constraints, and
JSON-safety validation live in `model/relation/definition.ts`. Their type-only circular reference
describes the recursive Entity/Relation model without introducing a runtime cycle or a dependency
on the compatibility facade. Locator declaration types and normalization now live in
`model/entity/locator.ts`; selected identity lookup and materialization live in
`model/entity/ref/identity.ts`, with the old ref path reduced to another tested facade. Reference
Field declarations and their guard now live in `model/entity/reference-field.ts`. The portable
variant descriptor contract and type projections were separated from query/selection execution,
allowing schema reference declarations and validation to move to
`model/entity/ref/schema-reference.ts`; all corresponding historical exports remain facades.
Physical table/column mapping, Relation mapping, and field resolution now live in
`computation/entity-mapping.ts`, so storage projection no longer appears to be Entity model
semantics merely because it was implemented in `definitions.ts`. Selection AST semantics and
recursive View AST/inference/construction now live under `model/query`. The historical `view.ts`
retains only the overload that composes Views with the still-mixed Graph schema declarations.
The first value-schema extraction places `GraphSchemaLike`, literal and void definitions,
presentation metadata, and their dependency-free authoring helpers under `value/schema`. The
historical composite `GraphSchemaDefinition` remains in `definitions.ts` because it intentionally
unites value schemas with Entity refs, Views, and Selections; moving that union into `value` would
invert the accepted dependency direction.

Generic array, nullable, optional, union, record, default, transform, refinement, and named schema
containers now also live under `value/schema`. Their definitions accept the resolved value type as
an explicit parameter, keeping this layer independent of Entity references. The historical
`Graph*Definition` interfaces and `graphSchema.*` builders remain at the compatibility boundary and
inject `InferGraphSchemaValue`, preserving model-aware reference inference without making
`value/schema` depend on `model/entity`.

Portable named-value and object-schema structures, their derivation metadata, and their basic
constructors now live in `value/schema` as well. `data-graph` retains the historical interfaces and
supplies `InferGraphSchemaFields`; this keeps optional-field and Entity-reference inference at the
composition boundary while moving the dependency-free runtime representation to its intended
owner.
