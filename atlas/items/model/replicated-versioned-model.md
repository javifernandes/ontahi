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

The first extension surface is a behavioral Materializer SPI. A Materializer is versioned behavior
that consumes application input and derivation context, then returns artifacts, output changes,
dependencies, and diagnostics. It may express one-to-one, one-to-many, many-to-one, cross-record,
or externally materialized derivations. Missing dependency evidence, source gaps, or incompatible
implementation versions require a full rebuild rather than guessed partial publication.

Full rebuild, incremental update, validation, and repair are distinct operations over the same
logical model. Full rebuild remains the recovery path and equivalence oracle after incremental
maintenance becomes primary.

A future declarative Entity API may name recurring source/output identities, dependencies,
versions, and consistency requirements after Atlas and BookOps prove their common shape. That
declaration compiles to the behavioral SPI; it does not replace application-specific behavior.

Cooling, eviction, storage tiers, and restore policy are optional physical policies over a
reconstructible Replicated Versioned Model. They are not part of its semantic identity and are not
prerequisites for incremental derivation.
