# 127a. Ontahi Storage Schema Contract Depth

Status: backlog

Canonical ID: `ontahi://plans/127a-ontahi-storage-schema-contract-depth`

Migrated from: `bookops://plans/127a-ontahi-storage-schema-contract-depth`
Original path: `plans/backlog/follow-up/127a-ontahi-storage-schema-contract-depth.md`
Source commit: `f9e32aed`

Source plan: [`127. Ontahi Storage Schema Contract Validation`](../../done/127-ontahi-storage-schema-contract-validation.md)

## Summary

Extend the proven table/column existence gate only where Ontahi can state compatibility semantics
precisely. Candidate checks include field types, nullability, identities, unique constraints,
relations, indexes, and storage-enforced policy metadata.

## Scope

1. Define compatibility rules before reading more provider metadata.
2. Add one bounded PostgreSQL check at a time with structured issues.
3. Decide whether a provider-neutral contract is justified only after a second adapter proves it.

## Non-Goals

1. Do not generate migrations.
2. Do not require every physical column or index to appear in the Ontahi model.
3. Do not turn warnings into blocking failures without an unambiguous safety rule.

## Proposed Form

```ts
expect(inspection.issues).toContainEqual({
  kind: 'field-type-incompatible',
  entity: 'TodoItem',
  field: 'completed',
  expected: 'boolean',
  actual: 'text',
});
```

## Acceptance Checklist

- [ ] The first added check has explicit semantic compatibility rules.
- [ ] False-positive cases are documented and covered.
- [ ] BookOps proves the check against a migration-built database.
- [ ] Provider-neutral extraction waits for evidence from another storage adapter.
