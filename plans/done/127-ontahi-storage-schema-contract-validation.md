# 127. Ontahi Storage Schema Contract Validation

Status: done

Canonical ID: `ontahi://plans/127-ontahi-storage-schema-contract-validation`

Migrated from: `bookops://plans/127-ontahi-storage-schema-contract-validation`
Original path: `plans/done/127-ontahi-storage-schema-contract-validation.md`
Source commit: `cb9c038a`

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Shapes: [`Storage Schema Contract Validation`](ontahi://atlas/application-architecture-surface/storage-schema-contract-validation)

Related plans:

1. [`121. Ontahi Direct PostgreSQL Adapter`](./121-ontahi-direct-postgres-adapter.md)
2. [`123. Ontahi Declarative Entity Invariants`](ontahi://plans/123-ontahi-declarative-entity-invariants)
3. [`126. Ontahi Runtime Data Reflection`](ontahi://plans/126-ontahi-runtime-data-reflection)

## Summary

Validate Ontahi's bound physical Entity mappings against a database created from the host's real
migrations, before application runtime. The first PostgreSQL slice checks that every mapped table
and column exists and runs as an integration gate against BookOps' isolated Supabase stack.

## Context

BookOps temporarily mapped `GitHubAppInstallation` to the conventionally inferred
`git_hub_app_installations` while the migration-owned table remained `github_app_installations`.
Unit tests could verify either side independently, but only a mapping-to-catalog comparison could
prove that the composed application and physical schema agreed.

## Research / Evidence

The first spike compared all materialized BookOps application Entities with
`information_schema.columns`. It immediately found:

1. `ContentNode.contentHash` mapped to `content_nodes.content_hash`, which does not exist;
2. `content_hash` belongs to `content_blocks`, and no runtime use required it on `ContentNode`;
3. `BookCollaborators` is a graph relation module, not a materialized Entity, so application API
   membership alone is not sufficient evidence of physical storage.

Removing the invalid `ContentNode` field made every current materialized table and column mapping
agree with a database recreated from all migrations.

## Scope

1. A PostgreSQL adapter API that reads catalog columns and returns structured contract issues.
2. A BookOps integration assertion over the composed application's semantic Entities and its
   remaining manually bound reader Entities.
3. An isolated migration-built database as the comparison authority.
4. CI and relevant pre-push execution before deployment.

## Non-Goals

1. Generating or applying migrations.
2. Requiring every database column to appear in an Entity.
3. Checking types, nullability, identities, unique constraints, foreign keys, indexes, or RLS in
   the first slice.
4. Treating relation modules, views, or operation-only graph surfaces as physical Entities.
5. Connecting to production for validation.

## Proposed Form

```ts
const inspection = await inspectPostgresDataGraphSchemaAtConnection({
  connection: { connectionString: testDatabaseUrl },
  entities: application.graph.listEntities().filter(isSemanticEntity),
});

expect(inspection.issues).toEqual([]);
```

The semantic result reports `table-not-found` and `column-not-found` issues with Entity, field,
schema, table, and column names. Database credentials and raw catalog rows are not part of the
result.

## Execution Slices

- [x] Prove live table and column comparison through the PostgreSQL adapter.
- [x] Run the check against the complete BookOps migration schema.
- [x] Classify relation modules outside the materialized Entity set.
- [x] Correct the `ContentNode.contentHash` drift found by the spike.
- [x] Add package and BookOps integration regression coverage.
- [x] Wire the check into CI and relevant pre-push database checks.

## Verification

- [x] A wrong table mapping fails before application runtime.
- [x] A wrong column mapping identifies both the semantic field and physical target.
- [x] A migration-built BookOps database passes after known drift is corrected.
- [x] Operation-only relation modules do not create false physical requirements.

## Deferred

Richer compatibility semantics are not required to close the table/column existence gate. Type and
nullability checks, constraints and policy metadata, and a provider-neutral contract now belong to
[`127a. Ontahi Storage Schema Contract Depth`](ontahi://plans/127a-ontahi-storage-schema-contract-depth).

## Decisions

1. This is static storage contract validation, not Runtime Data Reflection: it validates declared
   shape compatibility rather than profiling live domain data.
2. The host's migrations remain the physical source of truth.
3. Extra physical columns are allowed because an Entity may intentionally model a projection.
4. The first gate checks only facts with unambiguous compatibility semantics: table and column
   existence.
5. Production runtime must not be the first place this contract is evaluated.

## Open Questions

1. Should materialization become explicit metadata on an Entity/storage binding?
2. Which PostgreSQL types are safely compatible with Ontahi `id`, `string`, `number`, JSON, and
   enum fields?
3. Should nullable semantic fields require nullable physical columns, or only warn when writes can
   violate a stricter database constraint?
4. How should declared uniqueness and relations validate their physical indexes and foreign keys?

## Closure / Evolution

The first storage contract gate is complete and useful: it caught one additional real drift on its
first full application run, then became part of BookOps' migration-built CI and pre-push checks.
The capability intentionally remains table/column-only until richer compatibility semantics are
explicit.

## Closure

- Status: done
- Landed in: Ontahi PostgreSQL schema inspection and BookOps isolated schema checks
- Closed on: 2026-08-15
- Effective effort: multi-session spike and integration
- Follow-ups:
  - [`127a. Ontahi Storage Schema Contract Depth`](ontahi://plans/127a-ontahi-storage-schema-contract-depth)
