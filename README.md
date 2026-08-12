# Ontahi packages

Ontahi is currently developed as ten public-alpha packages inside the BookOps monorepo. Package
artifacts—not workspace source—are the compatibility boundary.

## Public alpha policy

- All packages share the lockstep version `0.1.0-alpha.0` while the first public contract is being
  proven.
- Packages require Node.js `>=20.19.0`, publish publicly with npm provenance, and use the
  Apache-2.0 license in [`LICENSE`](./LICENSE).
- TypeScript packages publish compiled `dist` artifacts only. `@ontahi/codegen` intentionally
  publishes executable `.mjs` sources plus matching declarations because it is a build-time Node
  package.
- Internal `workspace:*` dependencies are rewritten by `pnpm pack` to the exact lockstep version.
  A public alpha release must therefore publish the complete changed dependency closure.

## Deterministic release order

The artifact verifier derives this topological order from package dependencies and rejects cycles:

1. `@ontahi/codegen`
2. `@ontahi/core`
3. `@ontahi/opentelemetry`
4. `@ontahi/postgres`
5. `@ontahi/react`
6. `@ontahi/runtime-nextjs`
7. `@ontahi/runtime-vercel-workflows`
8. `@ontahi/supabase`
9. `@ontahi/explorer-react`
10. `@ontahi/runtime-express`

## Verify the artifacts

From the repository root:

```sh
pnpm run verify:ontahi-artifacts
```

The check builds and packs every package, validates each tarball and rewritten manifest, installs
them into fresh temporary projects with strict peer resolution, typechecks every public entrypoint
without `skipLibCheck`, and runs in-memory Core plus Express runtime smokes. It also proves that the
base Express runtime installs without React, Monaco, or Explorer UI packages.

CI may pass `--skip-build` after its package build step while retaining all pack, install, type, and
runtime checks.

## Verify the BookOps consumer

The artifact check is also exercised through an isolated BookOps workspace with no Ontahi source or
workspace links:

```sh
pnpm run verify:ontahi-bookops-consumer:quick
pnpm run verify:ontahi-bookops-consumer
```

The quick form runs representative package builds, codegen, web typecheck, and graph/runtime tests.
The full form adds the production web build and is the CI/release-candidate gate. Version pinning,
prerelease, rollback, and compatibility ownership are defined in
[`DEVELOPMENT.md`](./DEVELOPMENT.md).
