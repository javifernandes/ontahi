# @ontahi/supabase

Supabase adapters for Ontahi applications.

This package depends on `@ontahi/core` and should not leak back into core. It currently contains:

1. `@ontahi/supabase/data-graph`: Supabase execution runtime and query/command helpers for the Ontahi data graph.
2. `@ontahi/supabase/tasks`: Supabase-backed task run store for Ontahi task runtimes.

Product-specific graph schemas, repositories, task definitions, and workflow descriptors stay in
the host application.

## Atomic many-to-many relationships

Selection-valued many-to-many Relationship Commands use one PostgreSQL transaction through the
standard `ontahi_apply_many_to_many_relationship` Supabase RPC. Install the SQL exported as
`supabaseManyToManyRpcSql` in a project migration, then pass the participating semantic Entities to
`createSupabaseDataGraphRuntime({ entities: [...] })`. The runtime owns selection lowering, exact
delta materialization, and explicit-Ref cardinality checks; applications do not implement relation
mutation behavior.

The RPC uses invoker rights. Existing table grants and row-level-security policies therefore remain
authoritative. If the client does not expose `rpc`, the runtime fails explicitly instead of silently
degrading an atomic Relationship Command into several PostgREST mutations.

## Atomic direct relationships

Direct `belongsTo/hasMany` Relationship Commands use the companion
`ontahi_apply_relationship` RPC. Install the SQL exported as `supabaseRelationshipRpcSql` and pass
the participating server Entities to `createSupabaseDataGraphRuntime({ entities: [...] })`.

```ts
student.course.assign(nextCourse, { ifCurrent: previousCourse });
```

The RPC resolves both endpoint Refs, locks the source row, checks expected-current identity, applies
the FK transition, and reports the previous value in one database transaction. A stale conditional
assignment fails without changing the edge; inverse `remove` preserves its expected target as a
no-op guard. The function uses invoker rights, so normal grants and RLS remain authoritative.
Relations carrying portable eligibility constraints fail closed until those predicates can be
compiled into the same mutation boundary.

Use `relationshipRpcName` or `manyToManyRpcName` only when a project installs the corresponding
function under a non-default name. If `rpc` is unavailable, neither path degrades to a racy
PostgREST read followed by update.
