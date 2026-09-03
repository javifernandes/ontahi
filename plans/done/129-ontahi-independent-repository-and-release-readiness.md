# 129. Ontahi Independent Repository And Release Readiness

Status: done

Canonical ID: `ontahi://plans/129-ontahi-independent-repository-and-release-readiness`

Migrated from: `bookops://plans/129-ontahi-independent-repository-and-release-readiness`
Original path: `plans/done/129-ontahi-independent-repository-and-release-readiness.md`
Source commit: `cb9c038a`

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Durable shape: [`Independent Distribution`](ontahi://atlas/source-code-organization/independent-distribution)

Source plans:

1. [`100. Ontahi Framework Extraction`](./100-ontahi-framework-extraction.md)
2. [`122. Ontahi Developer Book`](./122-ontahi-developer-book.md)

## Summary

Determine whether Ontahi is ready to leave the BookOps monorepo, and prove the smallest release and
development workflow that keeps Ontahi and BookOps fast to evolve together after the split.

The decision is not “is Ontahi finished?” Authorization, events, AI Operations, more storage
adapters, and other semantic directions can evolve after extraction. The gate is whether the
existing framework can be built, packaged, installed, tested, released, and consumed without
BookOps source ownership or workspace-only assumptions.

## Context

The internal extraction line is complete:

1. ten framework packages live under `ontahi/packages/*`;
2. Todo Express is a non-BookOps executable application;
3. BookOps composes Ontahi as a host;
4. the first developer book teaches the same public concepts and package surfaces;
5. framework sources do not import BookOps application modules.

Repository separation introduces a different class of risk: package manifests, release ordering,
version compatibility, registry publication, cross-repository CI, source history, and the local
feedback loop when a BookOps change needs a new Ontahi capability.

The public `javifernandes/ontahi` repository already exists with the project website and canonical
Apache-2.0 legal files. It is the destination to integrate, not a repository still to create.

## Research / Evidence

The first manifest audit on 2026-08-12 found:

1. all ten packages already have explicit names, versions, exports, build/test scripts, and focused
   package boundaries;
2. nine TypeScript packages publish `dist`; `@ontahi/codegen` currently ships its JavaScript
   source entrypoints;
3. internal dependencies still use `workspace:*` and have not been validated from packed tarballs;
4. manifests currently report `1.0.0` but no public compatibility promise or release policy exists;
5. package manifests lack publication metadata such as license, repository, engines, and
   `publishConfig`; `@ontahi/explorer-react` also lacks a package README;
6. the BookOps repository has no open-source license or Ontahi package release workflow;
7. Todo Express consumes workspace packages, so it proves semantic portability but not registry or
   tarball portability;
8. BookOps also consumes workspace packages directly, so the cross-repository development loop is
   still unproven;
9. BookOps source already imports stable `@ontahi/*` package names in 182 files and has no
   TypeScript source aliases to package internals; only a small tooling set (root workspace/scripts,
   two workflows, formatting, and Tailwind scanning) names physical `ontahi/` paths.

These are release-readiness gaps, not evidence that the semantic framework must remain embedded.

## Scope

1. Audit source, build, test, package, and dependency ownership at the `ontahi/` boundary.
2. Validate every publishable package through `pnpm pack` and an external clean-room consumer.
3. Decide versioning, release ordering, changelog, prerelease, provenance, and npm scope policy.
4. Decide how BookOps consumes stable releases and validates candidate Ontahi changes.
5. Compare local development workflows for sibling repositories without making symlink behavior a
   hidden production assumption.
6. Define cross-repository compatibility CI and failure ownership.
7. Produce a go/no-go extraction decision and, if positive, an implementation plan for the move.

## Non-Goals

1. Finishing every current or future Ontahi feature before publishing an alpha.
2. Stabilizing the API as `1.0` merely because package manifests currently say `1.0.0`.
3. Moving BookOps, the Ontahi Library, or Atlas into the framework repository.
4. Choosing a monorepo release tool before the package dependency graph and release needs are
   measured.
5. Publishing packages or creating the external repository during the research pass.

## Options

### A. Split Source First

Move `ontahi/` immediately, then repair package and BookOps integration gaps across repositories.
This creates the desired ownership boundary early but combines source movement, publication, and
consumer migration into one high-risk transition.

### B. Prove Distribution In Place, Then Split

Make the current subtree publishable, install packed artifacts in a clean external fixture, move
BookOps to versioned package consumption, and only then transfer the already-proven source boundary.
This is the working hypothesis because each stage is reversible and produces evidence for the
next.

### C. Keep Ontahi Embedded

Continue workspace development indefinitely. This preserves the fastest single-repository loop but
keeps package release and independent-consumer assumptions untested, so it does not advance the
current strategic goal.

## Proposed Development Contract

The research should prove a two-speed loop:

1. **Normal BookOps work:** consume pinned released Ontahi versions from npm.
2. **Coordinated framework work:** implement in Ontahi, produce a packed artifact or `next`
   prerelease, validate it in BookOps, then release and update the BookOps lockfile.

For local development, compare:

1. sibling checkouts plus package-manager overrides to packed tarballs;
2. a local prerelease registry or `next` channel;
3. direct links only as an optional fast loop, never the only compatibility proof.

The chosen workflow must support one command or documented small sequence to rebuild Ontahi,
refresh BookOps, and run the affected compatibility suite. CI must exercise actual package
artifacts rather than sharing source paths.

## Extraction Gates

The repository move is ready when:

- [x] Each public package has intentional metadata, exports, files, license, README, and supported
      Node/package-manager policy.
- [x] Packed packages install and typecheck in a clean consumer with no workspace or BookOps paths.
- [x] Internal package dependency versions and release order are deterministic.
- [x] Todo Express runs against packed packages, not workspace source.
- [x] BookOps runs its representative build/test suite against versioned Ontahi artifacts.
- [x] The prerelease publication flow is documented and automated; stable promotion is a separate
      lifecycle follow-up rather than an extraction gate.
- [x] Cross-repository compatibility failures have an explicit owner and reproducible local path.
- [x] The source transfer preserves useful history and excludes BookOps-owned configuration,
      secrets, plans, and generated application artifacts.

Not extraction blockers by themselves:

1. declarative authorization and invariants;
2. first-class events or streaming observation;
3. AI Operations, Runtime Data Reflection, Alive UI, or Living Entities;
4. MySQL, MongoDB, gRPC, queue, or additional durable-runtime adapters;
5. the final long-term Capability or graph-segmentation model.

## Execution Slices

- [x] Capture the current package/subtree baseline and initial publication gaps.
- [x] Build an import and ownership audit for `ontahi/`, BookOps, Todo, and codegen.
- [x] Pack every package and inspect the exact artifact, dependency rewrite, and public type surface.
- [x] Install the artifacts in a temporary external Todo consumer and run build, tests, and runtime
      smoke checks.
- [x] Define versioning and release candidates, including whether the first public line is `0.x`.
- [x] Spike the BookOps consumer change against packed artifacts without moving repositories.
- [x] Compare the sibling-checkout, tarball-override, and prerelease development loops.
- [x] Define repository bootstrap, CI, publishing, provenance, and compatibility workflows.
- [x] Produce and execute the extraction decision and bounded implementation/migration plans.

## First Pack And Consumer Checkpoint

The first artifact spike built and packed all ten packages successfully. `pnpm pack` rewrote every
internal `workspace:*` dependency to exact `1.0.0`, and the tarballs contained their declared public
entrypoints. The largest artifacts were Core at about 344 KB and Explorer React at about 160 KB;
shipping both `dist` and `src` is unnecessary weight to review, not a blocking size problem.

A clean temporary consumer installed only the Core tarball, typechecked against its emitted
declarations, and executed an in-memory Todo application through `list` and `rename`. A second
consumer mounted the packed Express runtime successfully. This proves that the central semantic and
runtime artifacts work outside the workspace.

The full-package consumer exposed four concrete release blockers:

1. `@ontahi/codegen` ships executable `.mjs` sources but no declarations, so a TypeScript consumer
   fails with `TS7016`; the other nine package roots typechecked from their tarballs.
2. `@ontahi/runtime-express` has a hard dependency on `@ontahi/explorer-react/server`. Installing a
   server transport therefore pulls the React/Monaco package family even when Explorer is disabled.
3. The all-package peer graph selected ReactDOM 19 beside the declared React 18 peer and reported a
   mismatch. React-facing packages need an explicit ReactDOM/peer compatibility audit; Next.js and
   Workflow peers need the same treatment.
4. Before packages exist in a registry, exact internal dependencies try to resolve `@ontahi/core`
   remotely even when root tarballs are present. Local multi-package validation works with explicit
   package-manager overrides, so the development loop must generate those overrides or use a local
   prerelease registry.

These findings were extracted into and closed by
[`129a. Ontahi Public Package Artifact Hardening`](./129a-ontahi-public-package-artifact-hardening.md).

## Public Artifact Hardening Checkpoint

All ten packages now use the intentional lockstep public-alpha baseline `0.1.0-alpha.0`, retain
Ontahi's historical Apache-2.0 license, declare public/provenance and Node policies, and publish
explicit artifact file sets. Codegen has declarations; Express no longer installs the React
Explorer graph for base transport usage; React, ReactDOM, Next.js, and adapter ownership is explicit.

The clean-room verifier derives a deterministic release order, packs every package, rejects source
or workspace leakage, installs under strict peer resolution, typechecks all public entrypoints
without `skipLibCheck`, and executes Core/Todo plus Express smokes. CI exercises that same artifact
boundary. The package artifacts are therefore ready for the next consumer proof even though no npm
release has been published.

## BookOps Versioned Consumer Checkpoint

Plan 129b now reconstructs BookOps in a temporary workspace with no `ontahi/` directory, rewrites
its framework dependencies to exact versions backed by generated tarballs, and rejects any lockfile
or installed realpath that reaches workspace source. Five internal package builds, raw codegen, the
web typecheck, 82 graph/runtime/application tests, and the production Next.js build all pass against
the installed artifacts.

The chosen two-speed loop is evidence-based: direct workspace iteration runs the representative
test slice in about 27 seconds but is non-authoritative; the packed quick proof takes roughly two
minutes; the full production proof takes roughly four. Local coordinated changes use the packed
proof, CI uses the full proof for Ontahi changes, and future cross-repository coordination uses exact
`next` prereleases. Stable and prerelease pins, atomic lockfile updates, rollback, and compatibility
ownership are documented in `ontahi/DEVELOPMENT.md`.

## Final Readiness Verdict

Ontahi is independently source-owned, artifact-tested, prerelease-published, and consumed by
BookOps through exact npm versions. The public repository owns framework source, CI, Changesets,
provenance-backed publication, Todo Express, and clean-consumer verification. BookOps owns no
framework mirror and retains an explicit sibling mode only for coordinated local development.

The completed sequence was incremental:

1. harden and test public artifacts inside BookOps;
2. prove a versioned BookOps consumer path;
3. bootstrap the framework into the existing public repository;
4. publish provenance-backed prereleases through an explicit release-PR merge;
5. switch BookOps to exact registry packages and remove embedded source;
6. prove Todo Express and BookOps against the exact `0.1.0-alpha.3` release line.

Stable promotion remains a lifecycle milestone, not an extraction gap.

## Verification

Research is complete when its recommendation includes reproducible commands and artifacts, not
only a repository diagram. Another developer must be able to clone clean checkouts, install a
candidate Ontahi build into BookOps, run the compatibility checks, and explain how the same change
becomes a stable release.

## Decisions

1. Internal source extraction and independent distribution are separate milestones.
2. Public-alpha readiness is a packaging and compatibility claim, not a claim that Ontahi's model
   has stopped evolving.
3. Workspace source consumption cannot be the only portability evidence.
4. BookOps remains the primary production compatibility consumer after the split.
5. The pack/install and BookOps spikes earned an incremental split: public source first because
   provenance requires it, then registry proof, then BookOps source removal.

## Open Questions

1. When does independent adoption justify promotion from alpha to a stable compatibility promise?
2. Is npm provenance plus GitHub tags sufficient, or should releases also publish signed GitHub
   artifacts?

## Closure / Evolution

The gates passed. Ontahi moved to its public repository, publishes through npm Trusted Publishing,
and is consumed from BookOps as an independently versioned framework. Remaining semantic work no
longer depends on repository extraction.

Extracted implementation follow-ups:

1. [`129a. Ontahi Public Package Artifact Hardening`](./129a-ontahi-public-package-artifact-hardening.md) — complete.
2. [`129b. Ontahi BookOps Versioned Consumer And Development Loop`](bookops://plans/129b-ontahi-bookops-versioned-consumer-loop) — complete.
3. [`129c. Ontahi Public Repository And Prerelease Proof`](./129c-ontahi-public-repository-and-prerelease-proof.md) — complete.

## Closure

- Status: done
- Landed in: plans 129a-129c, Ontahi release `0.1.0-alpha.3`, and BookOps' exact registry consumer
- Closed on: 2026-08-15
- Effective effort: multi-session extraction program
- Follow-ups:
  - [`129d. Ontahi Stable Release Lifecycle`](ontahi://plans/129d-ontahi-stable-release-lifecycle)
