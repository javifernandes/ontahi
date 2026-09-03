# 129a. Ontahi Public Package Artifact Hardening

Status: done

Canonical ID: `ontahi://plans/129a-ontahi-public-package-artifact-hardening`

Migrated from: `bookops://plans/129a-ontahi-public-package-artifact-hardening`
Original path: `plans/done/129a-ontahi-public-package-artifact-hardening.md`
Source commit: `cb9c038a`

Parent plan: [`129. Ontahi Independent Repository And Release Readiness`](./129-ontahi-independent-repository-and-release-readiness.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

## Summary

Make the ten existing Ontahi packages honest public-alpha artifacts while they still live in the
BookOps repository. Close the concrete failures found by the first `pnpm pack`/clean-consumer spike
before adding the complexity of a second repository.

## Context

Every package builds and packs. Packed `@ontahi/core` typechecks and runs an external in-memory Todo
application; packed `@ontahi/runtime-express` creates a working router. The remaining problems are
at the release boundary:

1. missing license/repository/engine/publish metadata and no intentional public version policy;
2. no TypeScript declarations for `@ontahi/codegen`;
3. a server runtime hard-depending on the React/Monaco Explorer package;
4. incomplete ReactDOM and adapter peer declarations;
5. no artifact-consumer CI or automated local override/prerelease workflow;
6. all TypeScript packages include both `dist` and `src` without an explicit publication reason.

## Scope

1. Decide the public-alpha license and version baseline, likely a `0.x` line rather than treating
   the internal placeholder `1.0.0` as a stability promise.
2. Add consistent package metadata, README coverage, engine policy, and publication access.
3. Give `@ontahi/codegen` a typed public contract and artifact build.
4. Remove Explorer React from the base Express dependency graph: inject neutral descriptor builders
   or expose Explorer mounting through an optional focused entrypoint/package.
5. Audit React, ReactDOM, Next.js, Express, OpenTelemetry, PostgreSQL, and Workflow peer/dependency
   ownership.
6. Decide whether published artifacts contain `dist` only or intentionally include source.
7. Add a clean-room artifact fixture that installs packed packages and runs type/runtime smoke
   checks in CI.
8. Prove deterministic internal dependency rewriting and package release order.

## Non-Goals

1. Creating the independent Ontahi repository.
2. Publishing the first public release.
3. Migrating BookOps from workspace dependencies.
4. Changing Entity, Selection, Query, Command, or Operation semantics.
5. Solving every adapter or future framework direction before alpha.

## Proposed Package Boundary

The base server transport must stay server-shaped:

```json
{
  "name": "@ontahi/runtime-express",
  "dependencies": {
    "@ontahi/core": "<release range>"
  },
  "peerDependencies": {
    "express": ">=4.18 <6"
  }
}
```

Explorer snapshot construction can be injected by the host or mounted through a separate optional
integration. Installing Express operation invocation alone must not install React, Monaco, or UI
icon packages.

## Acceptance Checklist

- [x] A license/version decision is recorded and reflected consistently in all package manifests.
- [x] Every public package has intentional metadata, README, exports, files, engines, and
      publication access.
- [x] `@ontahi/codegen` supplies declarations and passes a clean TypeScript consumer test.
- [x] `@ontahi/runtime-express` installs and runs without Explorer React or browser UI dependencies.
- [x] React/ReactDOM and adapter peer ranges install without warnings in representative consumers.
- [x] Packed Core, React, Explorer, Express, Next.js, PostgreSQL, Supabase, OpenTelemetry, Workflow,
      and codegen entrypoints typecheck outside the workspace.
- [x] A packed Core/Todo runtime smoke and Express mount smoke run in CI.
- [x] The artifact fixture does not resolve Ontahi source through workspace paths.
- [x] Package dependency rewriting and release order are documented and reproducible.

## Verification

1. Build and pack all packages from a clean checkout.
2. Inspect tarball manifests and file lists.
3. Install artifacts into a temporary project with an empty lockfile.
4. Typecheck every exported package root and focused public subpath.
5. Execute the in-memory Todo and Express router smokes.
6. Fail the check if registry resolution, workspace paths, missing declarations, or unexpected peer
   warnings appear.

## Decisions

1. Package artifacts are the compatibility boundary; workspace builds are insufficient evidence.
2. Runtime packages must not acquire optional UI dependencies through convenience composition.
3. Public alpha may evolve, but its package metadata and install behavior must be deliberate.
4. This work lands before repository extraction so failures remain local and reversible.
5. The first public baseline is the lockstep version `0.1.0-alpha.0`, not the former internal
   placeholder `1.0.0`. Internal package edges pack to that exact version.
6. Ontahi retains its historical Apache-2.0 license and publishes with npm public access and
   provenance from the current repository until source extraction.
7. Packages support Node.js `>=20.19.0`. TypeScript packages publish `dist` only; codegen publishes
   executable `.mjs` sources with maintained declaration files.
8. Base Express accepts a neutral Explorer snapshot builder. The React Explorer integration lives
   behind the optional `@ontahi/runtime-express/explorer` entrypoint.

## Outcome

The clean-room verifier now derives the release order, builds and packs all ten packages, inspects
their file lists and rewritten manifests, and installs them under strict peer resolution into
fresh temporary projects. It typechecks every public entrypoint without `skipLibCheck`, runs an
in-memory Todo flow, mounts the Express runtime, and asserts that the minimal Express consumer did
not install Explorer React. CI runs the same artifact boundary after its package build.

The external typecheck exposed and closed two workspace-hidden declaration defects: anonymous Core
assembly return types emitted invalid generic references, and React Query inference leaked a
non-exported helper type from its dependency.

## Closure / Evolution

This plan closes with public package artifacts proven in place. Continue with
[`129b. Ontahi BookOps Versioned Consumer And Development Loop`](bookops://plans/129b-ontahi-bookops-versioned-consumer-loop).
Repository creation remains gated on that consumer proof, not on more package source movement.
