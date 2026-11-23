# 171a. Data Graph Consumer Migration And Compatibility Retirement

Status: backlog

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
5. Relocate the residual schema composition owned by `definitions.ts` and
   `schema-descriptor.ts`, then remove compatibility-only facades, tests, and package exports.
6. Publish the removal as a documented breaking prerelease.

## Non-Goals

- Redesigning Entity, schema, query, operation, or runtime behavior during import migration.
- Removing compatibility exports before all named first-party applications have shipped on the
  replacement imports.
- Preserving undocumented historical source paths after the breaking release.

## Acceptance Checklist

- [ ] Atlas, Bartlet, Todo, Classroom, and BookOps use the replacement public imports.
- [ ] The named applications pass their relevant builds and tests on the same Ontahí release.
- [ ] A repository and consumer audit finds no first-party `data-graph` subpath imports.
- [ ] Residual schema composition has an explicit non-compatibility owner.
- [ ] The `data-graph` compatibility namespace and package export are removed.
- [ ] Release notes identify replacement imports and the breaking removal.
