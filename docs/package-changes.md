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

## Release boundary

- Add a Changeset for consumer-visible behavior or public type changes.
- Add an empty Changeset when package-local tests or tooling changed without affecting consumers.
- Run `pnpm verify:artifacts` for new exports, package topology, dependency, or publishing changes.
- Verify tarballs from a clean consumer rather than relying only on workspace resolution.
- Ensure internal `workspace:*` dependencies become the expected exact lockstep version when packed.

## Validation

- Run focused tests plus package lint, build, and typecheck.
- Test public TypeScript entrypoints when exports or declarations change.
- Exercise at least one representative runtime path for new adapters.
- Confirm generated artifacts contain no source-only or server-only imports across browser
  boundaries.
