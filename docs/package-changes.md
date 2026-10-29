# Public package changes

Use this checklist when adding a package or changing its public boundary.

## Package contract

- Give the package one clear responsibility and keep technology-specific code out of Core.
- Declare every supported entrypoint in `package.json#exports`, with matching runtime and type files.
- Include only publishable output, `LICENSE`, and `NOTICE` in the artifact.
- Declare runtime, peer, and workspace dependencies explicitly; do not rely on root hoisting.
- Keep the supported Node.js range aligned with the repository policy.

## Workspace and automation

- Add build, test, typecheck, lint, and coverage scripts where applicable.
- Wire the package into workspace build order and CI when existing recursive scripts are
  insufficient.
- Update the lockfile with dependency or workspace topology changes.
- Add a package README describing responsibility, public entrypoints, and host-owned concerns.

## New public package topology

Adding a public package changes the release topology, not only the `packages/` directory. Complete
this audit in the same pull request:

- Add the package to the fixed group in `.changeset/config.json` so every lockstep release versions
  it with the rest of Ontahí.
- Increment `expectedPublicPackageCount` in `scripts/release/public-packages.mjs` and update current
  operational documentation that states the package count. Do not rewrite historical release or
  research records merely because their count was accurate at the time.
- Add the package name to the npm trusted-publishing bootstrap loop in `RELEASING.md`. A new npm
  package still requires its one-time registry and OIDC trust bootstrap before the first automated
  publish can succeed.
- Audit every clean-room or partial-package fixture. A fixture that installs package `A` from a
  tarball must also install the complete transitive closure of Ontahí tarballs required by `A`; it
  must not resolve a newly introduced internal dependency from npm before that package exists
  there. Derive this runtime-dependency closure from package manifests instead of maintaining
  another hard-coded list; do not turn optional peers into installed dependencies merely because
  they participate in release ordering.
- Update durable package-boundary documentation and Atlas source organization when the new package
  establishes a lasting architectural responsibility.

Run this same topology audit when an existing package gains a new internal `@ontahi/*` dependency.
The public package count may remain unchanged, but release order, partial consumers, and clean-room
installation can still change.

## Release boundary

- Add a Changeset for consumer-visible behavior or public type changes.
- Add an empty Changeset when package-local tests or tooling changed without affecting consumers.
- Run `pnpm verify:artifacts` for new exports, package topology, dependency, or publishing changes.
- Verify tarballs from a clean consumer rather than relying only on workspace resolution.
- Ensure internal `workspace:*` dependencies become the expected exact lockstep version when packed.
- Verify a package before its first registry publication: every internal dependency in the clean
  consumer must be overridden by the candidate tarball set, never fetched by package name.

## Validation

- Run focused tests plus package lint, build, and typecheck.
- Test public TypeScript entrypoints when exports or declarations change.
- Exercise at least one representative runtime path for new adapters.
- Confirm generated artifacts contain no source-only or server-only imports across browser
  boundaries.
