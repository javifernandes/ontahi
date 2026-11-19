# 169. Replicated Versioned Models Kernel And Materializer SPI

Status: current

Canonical ID: `ontahi://plans/169-replicated-versioned-models-kernel-and-materializer-spi`

Related plans:

1. [164. Derived Models, Projections And Provenance](../research/164-derived-models-projections-and-provenance.md)
2. `atlas://plans/153-replication-and-adaptive-materialization`
3. `atlas://plans/156-adaptive-materialization-policy`

## Summary

Define and prove the smallest provider-neutral kernel for maintaining one versioned representation
from another. A committed source delta identifies candidate changes, a behavioral Materializer
computes affected artifacts or Entities and their dependencies, and the kernel accepts a target
frontier only when the result is complete and attributable to exact source and implementation
versions.

Start with a behavioral SPI so host applications can express irregular derivations without waiting
for a universal declaration language. Atlas is the first adopter through incremental source
reconciliation. BookOps is the required second case. Only after both cases expose a stable common
shape should Ontahí design a declarative Entity-oriented surface that compiles to the SPI.

## Context

Research Plan 164 established that search indexes, translations, aggregates, denormalized read
models, and other persistent projections need identity, lineage, freshness, rebuild, incremental
maintenance, validation, and repair. It intentionally stopped before a public DSL.

Atlas now provides a bounded implementation pressure. Its Git-backed Source Records have immutable
revisions and durable file ChangeSets, but Markdown parsing and semantic projection still rebuild a
complete Workspace even when fewer than ten files change. Atlas Plan 156 needs a provider-neutral
contract for reusing compatible parsed artifacts, invalidating cross-record dependencies, deriving
affected Entities, and proving equality with full reconstruction.

BookOps offers a related but non-identical second case: Markdown files derive Parts, Chapters, and
other ordered content nodes. That case should challenge assumptions such as one input record
mapping to exactly one Entity.

## Research And Evidence

- Ontahí already separates Unit of Work, committed mutation outcomes, Events, Operation execution,
  implementation binding, and provider runtimes.
- The semantic mutation journal can describe committed Entity changes, while Atlas supplies exact
  provider-neutral file ChangeSets. Neither alone defines derived-model dependencies or an accepted
  target frontier.
- Events can transport a delta but do not prove that a projection incorporated it correctly.
- A full rebuild remains a useful oracle and repair operation even after incremental execution is
  primary.
- Atlas owns consumer-specific Source, Projection Revision, and reconciliation semantics. Ontahí
  should not import those application models into Core.

## Proposed Form

### Runtime kernel

The kernel owns only portable invariants:

1. stable derivation and Materializer implementation identity;
2. exact source frontier and accepted target frontier;
3. dependency and affected-set evidence;
4. stable output identity and implementation-version compatibility;
5. atomic acceptance or rejection of one derivation result;
6. rebuild, incremental update, validation, and repair as distinct modes;
7. deterministic fallback when a delta or dependency proof is incomplete.

The first kernel may run in process and keep its stores behind caller-provided ports. It does not
need a distributed scheduler, storage adapter, or public Entity DSL to prove these invariants.

### Behavioral Materializer SPI

Exact public types remain an implementation-slice decision, but the behavioral boundary must be
capable of this shape:

```ts
type MaterializerResult<Artifact, Change> = {
  artifacts: Artifact[];
  changes: Change[];
  dependencies: Dependency[];
  diagnostics: Diagnostic[];
};

interface Materializer<Input, Artifact, Change> {
  readonly id: string;
  readonly version: string;
  derive(input: Input, context: DerivationContext): Promise<MaterializerResult<Artifact, Change>>;
}
```

The host may calculate affected inputs before `derive`, let the Materializer discover dependencies,
or compose both. The accepted contract must support one-to-one, one-to-many, many-to-one,
cross-record, and externally materialized outputs without treating all of them as the same storage
shape.

### Entity declaration later

After Atlas and BookOps prove the SPI, recurring semantics may become a declaration over source
Entities or Selections, output Entity definitions, identity, dependencies, transformation version,
and consistency requirements. The declaration lowers to the behavioral SPI. It does not remove the
custom behavior escape hatch.

## Scope

- Define replicated versioned model, derivation identity, source/target frontier, dependency,
  affected set, artifact identity, compatibility, and acceptance semantics.
- Implement a small in-process reference kernel and behavioral Materializer SPI.
- Make full rebuild and incremental application comparable at one logical frontier.
- Expose caller-owned ports for artifact, dependency, and accepted-frontier persistence only where
  the first proof needs them.
- Prove the contract through Atlas incremental reconciliation and a subsequent BookOps adoption.
- Record the evidence required before designing a declarative Entity API.

## Non-Goals

- A CRDT, multi-master merge engine, offline convergence protocol, or exactly-once delivery claim.
- A universal ChangeSet vocabulary shared by every source and output.
- Cooling, eviction, hot/warm/cold tiers, pricing, or automatic storage lifecycle policy.
- A distributed scheduler, queue, database schema, or remote materialization service in the first
  slice.
- A stable public declarative DSL before two consumer adoptions.
- Moving Atlas or BookOps plans and domain concepts into Ontahí.

## Execution Slices

1. [x] Specify kernel values and invariants with executable examples for full rebuild, exact
       incremental application, duplicate replay, source gaps, version invalidation, frontier conflict,
       and failed acceptance.
2. [x] Extend the in-process reference kernel with the smallest behavioral Materializer SPI,
       dependency/affected-set evidence, unknown-dependency fallback, and the in-memory evidence retained
       by the first examples. Add caller-owned persistence ports only when a consumer proves they are
       required.
3. Integrate the SPI in Atlas Plan 156 for versioned parsed-record artifacts, affected Entity
   derivation, atomic Projection Revision publication, and full-rebuild comparison.
4. Use Atlas evidence to narrow rather than expand the Ontahí surface; promote incremental execution
   only after equivalence and invalidation checks pass.
5. Integrate the same SPI in one BookOps Markdown-to-content-node path that exercises ordering or
   cross-record dependencies.
6. Decide whether the two adoptions justify a declarative Entity derivation API; if so, extract it
   in a separate plan above the behavioral SPI.

## Acceptance Checklist

- [x] Derivation and Materializer versions are stable, explicit values rather than implicit code
      deployment state.
- [x] An accepted target frontier identifies the exact source frontier and implementation version
      it incorporates.
- [x] Duplicate incremental application is idempotent.
- [x] A source gap, unknown dependency, or incompatible Materializer version requests full rebuild
      instead of publishing a guessed partial result.
- [x] Failed derivation cannot advance the accepted target frontier.
- [ ] Incremental and full execution can be compared by logical output identity/content.
- [ ] Atlas reuses unchanged record artifacts and derives affected Entities without coupling the
      Ontahí kernel to Git or Markdown.
- [ ] BookOps proves a second topology before a declarative Entity API is stabilized.
- [x] A custom Materializer can express behavior outside any declarative subset.

## Verification

- Unit tests cover kernel state transitions, frontier acceptance, replay, gaps, version changes,
  dependency invalidation, and failure rollback.
- A reference Materializer proves one-to-one and cross-input derivation without provider services.
- Atlas comparison mode produces the same logical Projection Revision from incremental and full
  execution for create, update, delete, and move deltas.
- BookOps verifies at least one hierarchy, ordering, or cross-record case that differs from Atlas.
- Public package changes include a Changeset and pass the repository verification required by the
  touched packages.

## Decisions

1. “Replication” includes a one-way authoritative source feeding a maintained representation; it
   does not imply equal writers or multi-master convergence.
2. The first integration surface is a behavioral Materializer SPI.
3. Ontahí owns portable derivation/lineage invariants; applications own source observation,
   parsing, semantic transformation, publication, and domain policy.
4. Full rebuild remains the recovery path, validation oracle, and repair mechanism.
5. Logical derived-model identity is independent from whether full or incremental execution
   produced it.
6. Physical lifecycle policies are possible later plugins, not part of this plan.

## Open Questions

1. Is the first source frontier a single opaque version, an ordered set of versions, or a generic
   caller-defined value constrained only by stable equality and serialization?
2. Should affected-set calculation be a separate strategy, part of Materializer behavior, or both?
3. What minimum output-change vocabulary is portable without recreating application ChangeSets?
4. Which provenance belongs in ordinary reflected model metadata and which remains protected
   execution evidence?
5. Which BookOps path most strongly tests non-one-to-one derivation?

## Closure / Evolution

Current. The first executable slice defines opaque host-owned source/output frontier tokens,
explicit derivation and Materializer versions, and an in-memory JSON acceptance kernel. Exact
replay is idempotent; missing baselines, source gaps, and incremental version changes request a full
rebuild; conflicting output identity and failed derivation do not advance accepted state. The
second slice adds a behavior-first Materializer, explicit dependency and affected-output evidence,
an in-memory runner, and unknown-dependency fallback before derivation. Dependency evidence advances
only with kernel acceptance. One input can affect one or many outputs without imposing an Entity
DSL. The portable contracts live under `@ontahi/core`'s `model/replication` boundary while remaining
available through the package root. No persistence port was needed by this proof; Atlas Plan 156
should expose the first concrete storage boundary. Cooling, eviction, tiers, multi-master
convergence, and a declarative Entity DSL require separate evidence and plans.
