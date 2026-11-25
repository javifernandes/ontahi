# 171a. Data Graph Consumer Migration And Compatibility Retirement

Status: current

Canonical ID: `ontahi://plans/171a-data-graph-consumer-migration-and-compatibility-retirement`

Source plan: [171. Core Model And Runtime Boundaries](../done/171-core-model-and-runtime-boundaries.md)

## Summary

Migrate first-party applications from legacy `@ontahi/core/data-graph` subpath imports to the
model, value, computation, and runtime boundaries published in `1.0.0-alpha.22`, then remove the
compatibility namespace in an explicit breaking release.

## Scope

1. Inventory legacy imports in Atlas, Bartlet, Todo, Classroom, and BookOps.
2. Upgrade each application to the release that exposes the replacement subpaths.
3. Replace legacy subpath imports and verify application builds, tests, and deployments.
4. Confirm that no first-party consumer depends on the `data-graph` package export or historical
   source paths.
5. Retire the public compatibility export while preserving `data-graph` as an internal Core
   implementation directory until its remaining modules move for architectural reasons.
6. Publish the removal as a documented breaking prerelease.

## Non-Goals

- Redesigning Entity, schema, query, operation, or runtime behavior during import migration.
- Moving the remaining Core implementation modules merely to erase the internal `data-graph`
  directory name.
- Preserving undocumented historical source paths after the breaking release.

## Verification evidence

- Atlas `origin/main`: no legacy imports.
- Bartlet `origin/main`: no legacy imports.
- Todo and Classroom on Ontahí `origin/main`: migrated to the package root.
- BookOps PR [#532](https://github.com/javifernandes/bookops/pull/532) merged the final fifteen
  import migrations.
- The audit of the primary branches of Atlas, Bartlett, BookOps, Todo, and Classroom found no
  imports from the retired subpath.
- [Ontahi 1.0.0-alpha.26](https://github.com/javifernandes/ontahi/releases/tag/v1.0.0-alpha.26)
  published the breaking removal. Todo and Classroom follow the framework version through
  `workspace:*`. Standalone copies with the published version pinned reproduced the checked-in
  generated files using the repository formatter configuration.
- Both standalone examples passed codegen freshness, typecheck, and production builds.
  Classroom passed 8 tests, with the 5 PostgreSQL integration tests skipped in that run.
- The host upgrades are tracked by [Atlas #122](https://github.com/javifernandes/atlas/pull/122),
  [Bartlett #13](https://github.com/javifernandes/ppb-bartlett-test-reconstruccion-memoria/pull/13),
  and [BookOps #533](https://github.com/javifernandes/bookops/pull/533).
- Ontahí package sources, fixtures, current documentation, and clean-consumer proofs use the
  package root; historical completed plans retain their original references.

## Acceptance Checklist

- [x] Atlas, Bartlet, Todo, Classroom, and BookOps use the replacement public imports.
- [ ] The named applications pass their relevant builds and tests on the same Ontahí release.
- [x] A repository and consumer audit finds no first-party `data-graph` subpath imports.
- [x] Residual Core implementation has an explicit internal owner and is not a public subpath.
- [x] The `data-graph` compatibility package export is removed.
- [x] Release notes identify replacement imports and the breaking removal.
