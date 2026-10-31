# 164. Derived Models, Projections And Provenance

Status: research

Canonical ID: `ontahi://plans/164-derived-models-projections-and-provenance`

Related plans:

1. [125a. Model Execution Resource Governance](../current/125a-model-execution-resource-governance.md)
2. [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)
3. [146m. Managed HTTP Event Egress](../done/146m-managed-http-event-egress.md)
4. [154d. Semantic Mutation Journal And Query Invalidation](../done/154d-semantic-mutation-journal-and-query-invalidation.md)
5. [158. Semantic Execution Context, Governance And Evidence](158-semantic-execution-context-governance-and-evidence.md)
6. [160. Semantic Modules, Composition And System Boundaries](160-semantic-modules-composition-and-system-boundaries.md)

## Summary

Investigate models that are derived from other semantic models but persist beyond one calculation:
search indexes, translations, embeddings, summaries, aggregates, denormalized read models, and
materialized projections. A derived model should retain an inspectable correspondence to its source,
the derivation Operation and implementation, the source version or causal frontier it covers, and
its current freshness or drift state.

This research is adjacent to Resource Governance without collapsing into it. An external search
service or model provider is a Resource with admission, quota, latency, cost, failure, and usage
evidence. The search index or translation it produces is a derived model with lineage, identity,
freshness, repair, and lifecycle semantics.

## Evidence And Pressure

A host application currently uses a managed search provider and model-backed language processing
through direct provider calls. Both should eventually gain ordinary Ontahí attribution, audit,
limits, retries, and interchangeable adapters by executing as Operations over governed Resources.
They also expose a second concern that invocation wrappers alone cannot express:

1. search requires an index produced from source entities before queries can be answered;
2. a translation corresponds to a particular source work, part, language, and revision;
3. a statistic or summary may be cheap to recompute but still needs to reveal which source state it
   represents;
4. mutations can make any of these artifacts stale without making them immediately unusable;
5. rebuilding, incrementally updating, validating, and repairing a derivation are different
   Operations from consuming it.

## Semantic Distinctions

| Concept       | Meaning                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| Source model  | Authoritative semantic facts from which another representation derives               |
| Derivation    | Declared relationship and computation from source model to derived model             |
| Derived model | Identity-bearing output that can be stored, queried, distributed, or rebuilt         |
| Resource      | Scarce or external capability consumed while deriving or querying                    |
| Operation     | Semantic work such as index, translate, rebuild, validate, or search                 |
| Provenance    | Source identity/version, derivation identity, implementation, and execution evidence |
| Freshness     | Whether the derived model covers the required source frontier                        |
| Drift         | Disagreement between claimed lineage and observed derived state                      |

A derived model is not merely a cache entry. It may have its own schema, identity, lifecycle,
runtime, access policy, and consumers. Nor is every computed value a derived model: an ephemeral
pure calculation does not need persistent lineage merely because it depends on an Entity.

## Two Concrete Shapes

### Search

```text
source entities
    -> index/reindex Operation
        -> managed search Resource
            -> search-index derived model
                -> search Operation
```

`search` consumes the provider Resource and requires a compatible index at an acceptable freshness
frontier. It should not blindly run `index` before every query. A host policy may reject, enqueue a
rebuild, update synchronously, accept bounded staleness, or use another implementation. That policy
must not be hidden inside an HTTP adapter.

### Translation

```text
source work + source revision + target language
    -> translate Operation
        -> model or translation Resource
            -> translated derived model
```

The translation preserves correspondence to the original rather than becoming an unrelated text
blob. Provenance may include aligned source parts, source revision, target locale, derivation
contract, implementation binding, and model Resource evidence. A changed source can mark only the
affected translation segments stale and schedule repair without erasing their identity.

## Relationship To Events And Operations

Events can report committed source changes and trigger asynchronous projection maintenance, but
they do not define the derivation or guarantee freshness. Operations own rebuild, incremental
update, validation, repair, and query behavior. Durable Operations may interpret expensive work;
ordinary immediate Operations may consume an already acceptable projection.

The mutation journal or Unit of Work can provide a precise committed delta. Event delivery can
transport that delta or a reference to it across modules and runtimes. The derived-model contract
still needs to state which source frontier was incorporated so delivery success is not mistaken for
projection correctness.

## Questions

1. Is derivation authored on the source model, the derived model, a Module, or as a separate named
   semantic declaration?
2. Which source identity/version vocabulary works for one Entity, a Selection, a Module subgraph,
   and a distributed causal frontier?
3. Should freshness be a requirement evaluated before an Operation, an execution-planning input,
   or both?
4. How do virtual derived Fields, materialized database values, remote search indexes, and full
   translated models share semantics without pretending they have the same lifecycle?
5. Which correspondence is structural and queryable, and which execution provenance belongs only
   in protected evidence?
6. How are rebuild, incremental maintenance, validation, drift detection, and repair represented?
7. When can a stale projection remain usable, and who selects that policy?
8. How do authorization over source facts and authorization over a derived projection compose?
9. How can a Resource adapter change without changing the identity of the derivation contract?
10. What does distribution mean when the source and derived models live in different Modules or
    runtimes?

## First Research Slice

Use search as the first non-model Resource case and translation as the richer provenance case:

1. inventory the current direct provider calls in one host application without changing it;
2. describe index, search, translate, rebuild, and freshness-check as candidate Operations;
3. identify the smallest provider-neutral Resource evidence shared by search and model calls;
4. model one index lineage record and one translation correspondence without choosing storage;
5. exercise fresh, stale-but-usable, missing, rebuilding, and drifted outcomes;
6. decide what belongs in Resource Governance, Operation execution, Events, Entity/Relation models,
   and a new derivation declaration;
7. end with a continue/reshape/stop decision before introducing a public DSL.

## Non-Goals

1. Do not build an Algolia-specific abstraction into Core.
2. Do not treat every cache, computed Field, or Operation output as a persistent derived model.
3. Do not make Events the only way Modules or projections integrate.
4. Do not equate successful event delivery with freshness or correctness.
5. Do not expose provider credentials, private prompts, source content, or protected provenance to
   clients by default.
6. Do not promise exactly-once indexing, translation, or external effects.
7. Do not select a universal consistency model before concrete search and translation evidence.
