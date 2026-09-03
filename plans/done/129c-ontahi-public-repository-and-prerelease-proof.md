# 129c. Ontahi Public Repository And Prerelease Proof

Status: done

Canonical ID: `ontahi://plans/129c-ontahi-public-repository-and-prerelease-proof`

Migrated from: `bookops://plans/129c-ontahi-public-repository-and-prerelease-proof`
Original path: `plans/done/129c-ontahi-public-repository-and-prerelease-proof.md`
Source commit: `cb9c038a`

Parent plan: [`129. Ontahi Independent Repository And Release Readiness`](./129-ontahi-independent-repository-and-release-readiness.md)

Predecessor: [`129b. Ontahi BookOps Versioned Consumer And Development Loop`](bookops://plans/129b-ontahi-bookops-versioned-consumer-loop)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

## Summary

Complete Ontahi's public distribution boundary: maintain the framework in
`javifernandes/ontahi`, publish provenance-backed prereleases, consume exact registry versions from
BookOps and Todo Express, and preserve a fast opt-in sibling development loop.

## Context

The framework now lives in the public repository beside its website. All ten packages are public
through the `0.1.0-alpha.3` release line, carry Apache-2.0 legal files and public-source metadata,
and are published from a Changesets release PR using npm Trusted Publishing and provenance. Merging
that release PR is the explicit publication authorization; ordinary feature merges only update the
release candidate.

BookOps pins the exact published versions, verifies that pnpm resolves them from the registry, and
runs its normal build and tests across that boundary. Its former embedded `ontahi/` subtree and the
CI paths that compiled it have been removed. Coordinated framework/application work remains fast
through an explicit sibling-checkout mode that never changes committed manifests or the lockfile.

## Research / Evidence

1. `javifernandes/ontahi` is public and already contains `apps/www`, root workspace tooling, the
   canonical Apache-2.0 `LICENSE`, and `NOTICE`; its `packages/` and `books/` directories are still
   placeholders.
2. The framework boundary contains ten packages, Todo Express, and the clean-consumer fixture, with
   useful history across 21 BookOps commits touching `ontahi/`.
3. The public repository license is byte-identical to the framework license.
4. The repository integration preserved the existing site and useful framework history without
   importing BookOps-owned application source or secrets.
5. Clean package verification now checks legal files, public metadata, exports, dependency closure,
   and isolated consumer behavior before release.
6. A sibling-checkout spike proved that raw symlinks duplicate React peer/type contexts, while
   pnpm's `file:` protocol keeps peers host-owned and hard-links built artifacts. BookOps typecheck
   and the representative selection/notification tests pass in that mode without changing its
   committed manifests or lockfile.
7. The published release uses npm OIDC Trusted Publishing; no long-lived npm token is stored in
   GitHub.
8. BookOps' registry guard rejects ranges, workspace/file links, version mismatches, or resolution
   outside pnpm's registry store.
9. Todo Express installed every consumed package at exactly `0.1.0-alpha.3`, generated its client,
   built successfully, and started through the isolated registry-consumer path.
10. The `v0.1.0-alpha.3` GitHub prerelease and all ten npm artifacts were produced by the same
    immutable release workflow.

## Realized Form

The existing website and framework are peers in one public workspace:

```text
ontahi/
├── apps/www/                  # existing public site
├── packages/{core,...}/       # imported framework packages
├── examples/todo-express/     # independent executable proof
├── fixtures/package-consumer/ # clean artifact proof
├── scripts/                   # site and release verification
├── LICENSE
├── NOTICE
└── package.json
```

Package `repository.directory` values are rooted at `packages/<name>`. Useful framework history was
preserved while root files with independent site ownership were reconciled deliberately.

## Scope

1. Point package metadata at the public Ontahi repository and include `LICENSE` and `NOTICE` in
   every source package and tarball.
2. Preserve useful `ontahi/` history while integrating the framework beside the existing
   `apps/www` site; exclude BookOps-owned plans, secrets, and application artifacts.
3. Establish independent workspace, build, test, package, and CI commands in the public repository.
4. Verify npm scope/package-name availability and release authority without exposing credentials.
5. Implement a Changesets release-PR workflow with immutable versions, provenance, deterministic
   dependency order, and a complete changed dependency closure.
6. Publish only when the release PR is explicitly merged; never publish from an ordinary feature
   PR or silently overwrite a released version.
7. Make Todo Express and a temporary BookOps consumer install exact registry prerelease versions
   with no tarball overrides or source paths, then reuse the 129b compatibility suite.
8. Document prerelease notes, failure recovery, and rollback; extract stable promotion and
   deprecation rehearsal as a separate lifecycle milestone.
9. Preserve a two-repository authoring loop: `pnpm ontahi:local` activates a sibling checkout,
   `pnpm ontahi:status` reports it, and `pnpm ontahi:registry` restores the lockfile-backed install.

## Non-Goals

1. Publishing any npm package without explicit authorization.
2. Reintroducing framework source into BookOps after registry consumption has passed.
3. Changing the existing Ontahi website beyond what repository integration requires.
4. Publishing a stable `1.0` or making API-stability claims.
5. Adding semantic framework features unrelated to distribution.

## Acceptance Checklist

- [x] Every package artifact points to public source and contains the canonical `LICENSE` and
      `NOTICE`.
- [x] BookOps can consume and continuously rebuild a sibling Ontahi checkout without committing
      local paths or changing its lockfile, then restore its normal dependency resolution.
- [x] The public repository contains the framework, useful source history, website, and an
      independent green build/test/package workflow.
- [x] Release authority and package-name availability are verified.
- [x] A release-PR workflow publishes all required packages in deterministic order with provenance
      only after explicit merge authorization.
- [x] Todo Express installs and runs from exact registry versions.
- [x] BookOps passes the 129b compatibility gate using exact registry versions and no overrides.
- [x] Prerelease notes, failure recovery, and consumer rollback are documented; stable promotion
      and deprecation rehearsal are explicitly tracked by plan 129d.
- [x] BookOps no longer contains embedded Ontahi source; normal CI verifies the exact npm consumer
      boundary, while sibling development remains explicitly opt-in.

## Verification

The public repository owns source, package, and release verification. BookOps owns consumer
compatibility: frozen install, registry-resolution guard, internal package builds, codegen,
typecheck, representative graph/runtime tests, and production web build. Any npm publication
requires merging the generated release PR and a unique version; published versions are never
overwritten.

## Closure / Evolution

The public repository, provenance-backed prerelease, Todo exact-registry proof, BookOps registry
consumption, source removal, and sibling loop are complete. Consumer rollback means pinning BookOps
to a prior published version; it does not mean restoring embedded source.

## Closure

- Status: done
- Landed in: Ontahi release PR #18 and the BookOps alpha.3 consumer migration
- Closed on: 2026-08-15
- Effective effort: multi-session extraction and release block
- Follow-ups:
  - [`129d. Ontahi Stable Release Lifecycle`](ontahi://plans/129d-ontahi-stable-release-lifecycle)
