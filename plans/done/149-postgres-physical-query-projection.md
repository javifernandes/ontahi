# 149. PostgreSQL physical query projection

Status: done

## Summary

Make `@ontahi/postgres` compile caller-authored `.select(...)` projections into narrow PostgreSQL
`SELECT` lists while preserving the internal keys required to materialize relations and keeping
those auxiliary keys out of public results.

## Context

`@ontahi/postgres` 1.0.0-alpha.11 currently applies `.select(...)` only while materializing the
JavaScript result. `columnsFor(mapping, spec)` still enumerates every mapped column for ordinary
root queries, so unselected wide `TEXT` and `JSONB` values cross the PostgreSQL connection.

The operational consequence was documented by the Atlas egress audit in
[`javifernandes/atlas#31`](https://github.com/javifernandes/atlas/pull/31). Atlas containment is
already host-owned; the generic compiler/runtime defect belongs in Ontahí.

## Research / Evidence

- `compilePostgresQuery()` is the only compiler entrypoint for ordinary root reads. Its predicates
  and ordering compile field expressions directly into `WHERE`/`ORDER BY`; those fields do not need
  to be returned.
- `readSpec()` owns physical execution. `materializeRow()` and `materializeSelection()` own the
  public shape, including nested aliases, reference lifting, selected Relation builders, and
  `.include(...)` values.
- A selected or included Relation needs only its source join field on the parent row. `belongsTo`
  and `hasMany` obtain that field through `resolveRelationFields()`; `manyToMany` resolves it from
  the edge mapping before loading target rows.
- Related-root execution uses raw Entity rows to obtain source join values. `countBySource` also
  needs the target join field. Nested related roots must propagate the outer join-field need to the
  inner target read.
- Public `resolveEntityRows()` is intentionally full-Entity despite a shaped target query, and the
  reflected related-Entity reader depends on that contract. Internal Entity-row reads can be
  narrower because their caller names the exact join fields it consumes.
- Virtual derived Fields compile as SQL expressions. Their stored-field and Relation-count
  dependencies belong inside those expressions, not as additional result columns. Reference Fields
  remain stored scalars internally and are lifted only during public materialization.
- `createPostgresReflectedEntityDataReader()` owns a separate introspection SQL path and continues to
  select all available reflected columns; it does not consume `compilePostgresQuery()`.

## Scope

- Trace query compilation, materialization, aliases, virtual derived fields, references, ordering,
  predicates, relation roots, includes, and internal relation loaders.
- Narrow physical root projections when `.select(...)` is present.
- Preserve all mapped columns when no explicit projection is present.
- Preserve only the auxiliary source/target keys required by relation loading and keep them out of
  public materialized results.
- Cover compiler SQL and a real PostgreSQL execution path with regression tests.
- Record the public behavior change in a Changeset for `@ontahi/postgres`.

## Non-Goals

- Do not change Atlas application code or its temporary caching/reconciliation containment.
- Do not add an Atlas-specific field or table exception.
- Do not publish packages or edit package versions/changelogs by hand.
- Do not introduce storage telemetry or redesign incremental reconciliation.

## Proposed Form

For a mapped entity with `id`, `title`, and a wide `content` column:

```ts
Article.all().select(article => ({ articleId: article.id }));
```

should compile a physical root projection equivalent to:

```sql
SELECT "id" AS "id" FROM "articles" WHERE TRUE
```

SQL rows retain semantic Field names so nested aliases and repeated selections can be materialized
without duplicating physical columns. When a selected Relation needs an unselected source key, the
runtime adds that semantic Field for relation loading, while materialization still returns only
`articleId` and the selected Relation.

## Execution Slices

1. Add a focused failing SQL compiler regression for an unselected wide column.
2. Inventory every query compiler/runtime consumer and identify required auxiliary relation keys.
3. Implement projection planning and public materialization without changing query semantics.
4. Add compiler, conformance, and PostgreSQL integration coverage for direct and related reads.
5. Run package and repository verification, add the Changeset, and audit this plan before the PR.

## Acceptance Checklist

- [x] `.select(id)` excludes an unselected wide `content` column from executed SQL.
- [x] Multiple selected fields, duplicate fields, and aliases compile correctly.
- [x] Queries without `.select(...)` still select every mapped physical field.
- [x] Predicates and ordering do not widen the result projection unnecessarily.
- [x] References and virtual derived fields preserve their current behavior.
- [x] `belongsTo`, `hasMany`, nested includes, and related-root queries keep the keys they need.
- [x] `entityRows`, `countBySource`, and internal relation loads remain covered without regressions.
- [x] A PostgreSQL integration test captures executed SQL and proves a wide unselected `TEXT`
      column is absent.
- [x] `@ontahi/postgres` package tests, typecheck, lint, format, build, and required repository gates
      pass.
- [x] A patch Changeset describes the narrower PostgreSQL wire projection.

## Verification

The focused compiler regression failed before production changes because the SQL still selected
`id`, `title`, and `content`; it passed after the implementation with only `id` in the physical
projection.

Final verification:

- `pnpm --filter @ontahi/postgres test:unit` — 10 passed.
- `pnpm --filter @ontahi/postgres test:integration` — 42 passed against PostgreSQL.
- `pnpm --filter @ontahi/postgres typecheck` and `pnpm --filter @ontahi/postgres lint` — passed.
- `pnpm test:packages` — all 11 package suites passed; PostgreSQL passed 96 tests.
- `pnpm test:coverage:packages` — all package coverage suites passed; PostgreSQL finished at 90.18%
  statements, 80.89% branches, 96.17% functions, and 91.16% lines.
- `pnpm test:examples` — 67 passed; the five optional Classroom PostgreSQL tests were skipped
  because `ONTAHI_POSTGRES_TEST_URL` was not configured.
- `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm typecheck`, and `pnpm todo:build` — passed.
- `pnpm verify:artifacts -- --skip-build` — clean-consumer checks passed for all 11 packages.
- `pnpm release:npm:prepare -- --tag alpha --output .artifacts/npm/candidate` and the matching
  `pnpm release:npm:dry-run` — all 11 package payloads passed.

## Decisions

- Physical projection is a PostgreSQL adapter concern; the logical query shape remains owned by
  Core.
- SQL fields referenced only by `WHERE` or `ORDER BY` stay usable in those clauses without being
  added to the `SELECT` list.
- The release workflow, not this feature branch, will advance lockstep prerelease versions and
  generate package changelogs.

## Resolved Questions

- Direct `belongsTo` loads require the stored foreign key; `hasMany` loads require the source
  identity; many-to-many loads require the source-side edge key. Related-root source and target
  reads propagate only the specific join Field consumed by their caller.
- The integration harness accepts a pool-shaped `query` seam. Wrapping that seam records the exact
  executed statement without adding a public observer solely for this regression.

## Closure / Evolution

Completed on 2026-09-07. The compiler now plans physical columns from the selected semantic Fields,
deduplicates aliases, and adds only Relation source keys. The runtime separately requests exact
join Fields for internal Entity-row and related-root modes, while public materialization and
`resolveEntityRows()` keep their established contracts. A patch Changeset targets
`@ontahi/postgres`; the current release automation candidate is `1.0.0-alpha.12`.

Implementation PR: [javifernandes/ontahi#139](https://github.com/javifernandes/ontahi/pull/139).
No Atlas application change is included.
