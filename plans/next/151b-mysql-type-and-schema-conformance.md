# 151b. MySQL Physical Type and Schema Conformance

Status: next

Canonical ID: `ontahi://plans/151b-mysql-type-and-schema-conformance`

## Context

[151](../done/151-mysql-data-graph-storage.md) delivers functional MySQL 8.4/InnoDB storage with the
Todo host, exact mutations, upsert, relationships, and concurrency proofs. Its physical contract
covers the tested strings, nullable values, booleans, integer identities, and derived expressions.
It deliberately does not equate driver defaults or every physical PostgreSQL type with Ontahi
values. This follow-up preserves the wider conformance work identified in that plan.

## Work

- Define date/time and timezone behavior against Core value semantics; exercise actual driver
  results and configured pools, including boundaries that would otherwise change a calendar date.
- Test JSON objects/arrays/null, DECIMAL, and BIGINT near and beyond safe JavaScript integer limits.
  Choose explicit conversions or clear rejection rather than silent precision loss.
- Extend schema diagnostics to missing or incompatible keys, nullable references, physical types,
  collations, order-column ranges, and edge indexes before user mutations where practical.
- Prove behavior with changed/default physical columns and document any trigger restrictions.
- Keep implementation in MySQL unless real compatible behavior warrants extraction to `@ontahi/sql`.

## Acceptance

- [ ] A documented physical-type matrix has real MySQL round-trip/read/predicate tests.
- [ ] Unsafe conversions fail clearly rather than silently corrupting values.
- [ ] Schema diagnostics identify the specific Entity, Field, Relation, and physical contract.
- [ ] Package tests, typecheck/build, lint/format, Changeset, and artifact checks pass.

MariaDB remains a separate pinned-provider evaluation; this plan does not declare protocol
compatibility to be behavioral conformance. SQLite and SQL/PGQ/GQL are separate work as well.
