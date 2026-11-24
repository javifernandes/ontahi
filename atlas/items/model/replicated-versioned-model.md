---
id: ontahi.model.replicated-versioned-model
kind: concept
title: Replicated Versioned Model
parent: ontahi.model
status: shaping
horizon: now
supports:
  - ontahi
  - spec-workstream-atlas.atlas-model.source-derivation
relatedPlans:
  - ontahi://plans/164-derived-models-projections-and-provenance
  - ontahi://plans/169-replicated-versioned-models-kernel-and-materializer-spi
  - ontahi://plans/172-replicated-collection-observer-and-acceptance-runner
  - atlas://plans/153-replication-and-adaptive-materialization
  - atlas://plans/156-adaptive-materialization-policy
---

A Replicated Versioned Model is an identity-bearing representation maintained from one or more
versioned source models. It records which exact source frontier and derivation implementation it
incorporates, so consumers can distinguish current, stale, missing, rebuilding, invalid, and drifted
representations without confusing successful delivery with correct derivation.

“Replicated” includes the common one-way case: one authoritative source feeds a maintained derived
representation. It does not imply equal writers, a multi-master topology, offline convergence, or a
CRDT. Search indexes, translations, aggregates, denormalized read models, and Atlas Projection
Revisions may all instantiate the concept while retaining different schemas, lifecycles, policies,
and providers.

The portable runtime kernel owns derivation identity, source and accepted target frontiers,
dependency/affected-set evidence, output compatibility, and atomic acceptance. Applications retain
source observation, domain parsing and transformation, publication, authorization, and consistency
policy.

The first executable kernel treats source and accepted frontiers as opaque host-owned string tokens.
Ontahí compares exact identity but does not invent ordering or causal meaning for them. An in-memory
reference implementation retains a detached JSON snapshot and returns `accepted`,
`rebuild-required`, or `rejected`: exact replay is idempotent; a missing baseline, source gap, or
incremental Materializer version change requires rebuild; conflicting output identity or a failed
derivation cannot advance accepted state. Persistence and publication ports remain outside this
first slice.

The first extension surface is a behavioral Materializer SPI. A Materializer is versioned behavior
that consumes application input and derivation context, then returns artifacts, output changes,
dependencies, and diagnostics. It may express one-to-one, one-to-many, many-to-one, cross-record,
or externally materialized derivations. Missing dependency evidence, source gaps, or incompatible
implementation versions require a full rebuild rather than guessed partial publication.

The reference runner asks the Materializer for an affected-output set before incremental
derivation. `known` evidence is passed into behavior; `unknown` requests a rebuild without invoking
that behavior. Dependency evidence returned by a successful derivation replaces the retained index
only after the kernel accepts the candidate, so rejected frontiers cannot corrupt later
invalidation.

A runner may begin with a caller-owned accepted snapshot and dependency index restored across a
process boundary. Core detaches hydrated JSON and dependency values from caller mutation and checks
derivation identity at construction. Before incremental behavior runs, it rejects a missing
baseline, incompatible Materializer version, or Source frontier gap with an explicit rebuild
request. Persistence technology, artifact storage, transaction scope, and publication remain host
responsibilities; hydration does not turn Core into a storage runtime.

The portable contract belongs to the Core model layer under `model/replication`; it is not itself a
storage or server runtime. Core continues to expose it from the package root so physical module
organization does not become a consumer migration.

Full rebuild, incremental update, validation, and repair are distinct operations over the same
logical model. Full rebuild remains the recovery path and equivalence oracle after incremental
maintenance becomes primary.

A provider-neutral Replicated Collection Observer precedes materialization when the source is an
independently versioned collection. It observes from an accepted opaque frontier in `bootstrap`,
`incremental`, `validation`, or `repair` mode and returns idempotent positive or negative record
changes, a target frontier, diagnostics, and fetched work. The reference acceptance runner applies
those changes to an isolated candidate, reports fetched, changed, reused, and resulting counts,
and exposes only a detached complete snapshot after acceptance. Complete validation compares
without mutation; a delayed writer cannot replace state advanced from the frontier it originally
read.

Replica records are internal persisted records by default rather than implicitly addressable
Entities. The acceptance runner persists them through a store-owned revision and atomic
compare-and-swap port. Composition resolves that port from the application's active Entity storage
by default while keeping replica namespaces and semantics distinct; the in-memory Entity storage
provides the reference capability. A custom storage adapter is an escape hatch for stores that
cannot provide the capability, not the default application setup.

A future declarative Entity API may name recurring source/output identities, dependencies,
versions, and consistency requirements after Atlas and BookOps prove their common shape. That
declaration compiles to the behavioral SPI; it does not replace application-specific behavior.

Cooling, eviction, storage tiers, and restore policy are optional physical policies over a
reconstructible Replicated Versioned Model. They are not part of its semantic identity and are not
prerequisites for incremental derivation.
