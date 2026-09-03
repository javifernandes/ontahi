---
id: ontahi.storage-schema-contract-validation
kind: capability
title: Storage Schema Contract Validation
parent: ontahi.application-architecture-surface
status: active
horizon: now
supports:
  - ontahi
  - ontahi.independently-usable
relatedPlans:
  - ontahi://plans/127-ontahi-storage-schema-contract-validation
  - ontahi://plans/127a-ontahi-storage-schema-contract-depth
  - ontahi://plans/121-ontahi-direct-postgres-adapter
  - ontahi://plans/123-ontahi-declarative-entity-invariants
migratedFrom: bookops://atlas/application-architecture-surface/storage-schema-contract-validation
sourceCommit: 67713696
---

[[ontahi.storage-schema-contract-validation|Storage Schema Contract Validation]] checks that an
application's bound physical Entity mappings are compatible with the schema produced by its host
migrations before application runtime.

The first PostgreSQL contract reads catalog metadata and verifies that mapped tables and columns
exist. It allows extra physical columns, does not generate migrations, and does not inspect
production. BookOps exercises the contract against an isolated Supabase database recreated from
all migrations, which catches drift between semantic fields, conventional or overridden mappings,
and the physical schema in CI.

This capability is distinct from [[ontahi.runtime-data-reflection|Runtime Data Reflection]]. Schema
contract validation is a build/test-time compatibility gate over declared physical shape; Runtime
Data Reflection describes dynamic facts and capabilities of live domain data under authority.

The table/column existence gate is complete and runs in BookOps CI and relevant pre-push checks.
Future checks may cover type compatibility, nullability, identities, invariants, relations,
indexes, and policies. Each requires explicit compatibility semantics; they should not be inferred
merely because PostgreSQL exposes more catalog metadata.
