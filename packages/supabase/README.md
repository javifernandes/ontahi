# @ontahi/supabase

Supabase adapters for Ontahi applications.

See the canonical [Relations](../../docs/developers/02-core-concepts/03-relations.md) and
[storage adapters](../../docs/developers/03-runtimes/02-storage-adapters.md) chapters for the
application-level model and transaction boundary. This README documents provider-specific behavior.

This package depends on `@ontahi/core` and should not leak back into core. It currently contains:

1. `@ontahi/supabase/data-graph`: Supabase execution runtime and query/command helpers for the Ontahi data graph.
2. `@ontahi/supabase/tasks`: Supabase-backed task run store for Ontahi task runtimes.

Product-specific graph schemas, repositories, task definitions, and workflow descriptors stay in
the host application.

## Contextual Selection reads

`createSupabaseDataGraphRuntime({ entities: [...] })` supports contextual membership such as
`Book.by({ slug: 'book-one' }).parts.chapters.toQuery()`. Supply the complete receiver-owned
Entity registry, including source, intermediate and target definitions. The existing read methods
(`run`, `get`, `count`, buffered `stream`) retain their ordinary API and authority options.

The adapter lowers each hop to a native PostgREST empty embed and existence filter. It does not
prefetch source IDs or require a generic SQL RPC. Source predicates remain inside each membership
boundary; Boolean composition, target projections, ordering and limits preserve final target
membership. Count and exact-one reads use exact server count metadata. PostgREST executes with
the client supplied by the host, so RLS applies to source, intermediate, target and edge rows.

Physical FKs must match the declared relation join fields. Supported paths include `hasMany`
(including a self-FK such as `ContentNode.parent_id`), non-self `belongsTo`, and mapped many-to-many
relationships recognized by PostgREST. Many-to-many edges require single-field endpoint identities
and a physical composite key containing the endpoint FKs. Conventional table/column names and
explicit Entity mappings both work; this slice accepts simple SQL identifiers only. Missing or
ambiguous physical relationships fail at PostgREST, without a fallback to broader membership.

Inverse self `belongsTo`, composite many-to-many identities, virtual filter fields, contextual
Commands and observation remain unsupported. Custom computed-relationship overrides and schema
installation are not part of this API. The host owns schema compatibility and migrations.

For remote execution, a host may explicitly set `relationSelections: true` on its
`createGraphReadDispatcher`, backed by this runtime and its complete Entity registry. Policies
must grant each outgoing `selectionRelations` hop and scope each participating Entity. RLS is
additional protection, not a replacement for protocol authorization. Protocol v1 remains closed;
the low-level Supabase adapter does not automatically configure an application dispatcher.

Custom `SupabaseLikeClient` implementations must honor `.or(filter, { referencedTable })` for
nested alias paths as well as ordinary `.select(...)` embeddings. Ignoring the scoped-filter
option violates the contextual read contract. Exact-one/count clients must preserve count metadata.

Integration tests exercise PostgreSQL 17, PostgREST 13.0.0 and the actual Supabase PostgREST client
2.98.0 in disposable containers. They do not connect to a hosted Supabase project.

## Exact-one reads

Exact-one reads request `{ count: 'exact' }` with at most two root rows in the same PostgREST request,
before loading includes. The count measures filtered, RLS-visible membership before caller/server
row limits; a single returned row is not proof of uniqueness. Custom `SupabaseLikeClient`
implementations must preserve the exact count metadata. Missing metadata fails closed instead of
accepting a potentially capped result. Counting can cost more than a bounded row probe for large
Selections, but avoids a separate count/read race and handles server row caps correctly.

Reads and counts reject zero/multiple members and reject `one` combined with `limit(0)`.
Ordinary many-result and nullable first-result reads do not request additional count metadata.

## Exact Entity mutations

`createSupabaseDataGraphRuntime({ entities: [...] })` advertises Ontahi's focused
`EntityMutationCommand` capability for create, exact Ref-targeted update, and exact Ref-targeted
delete. The runtime resolves the semantic Entity from that registry, lowers declared column and Ref
mappings through PostgREST, requires exactly one returned row, and produces the same portable
created/updated/deleted delta as the in-memory, PostgreSQL, and remote runtimes.

Each command is one PostgREST mutation and remains subject to the project's grants and RLS. This
capability does not advertise bulk or Selection-targeted mutations, and it does not imply that
several commands can share rollback; use a server-side Operation or RPC when coordination across
multiple writes is required.

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

Portable participant eligibility is included in a version 2 payload. The RPC locks the complete
source and target sets, checks every selected row, and rejects a mixed set without inserting partial
edges. `unlink` omits link eligibility and remains available for repair. Upgrade the installed SQL
when adopting this package version: an older version 1 RPC rejects constrained payloads instead of
silently ignoring their constraints.

## Atomic direct relationships

Direct `belongsTo/hasMany` Relationship Commands use the companion
`ontahi_apply_relationship` RPC. Install the SQL exported as `supabaseRelationshipRpcSql` and pass
the participating server Entities to `createSupabaseDataGraphRuntime({ entities: [...] })`.

```ts
student.course.assign(nextCourse, { ifCurrent: previousCourse });
```

The RPC resolves both endpoint Refs, locks the source and target rows, checks expected-current
identity and every portable source/target participant constraint, applies the FK transition, and
reports the previous value in one database transaction. A stale conditional assignment fails
without changing the edge; inverse `remove` preserves its expected target as a no-op guard. A
constraint rejection preserves the declared version, code, safe message, and parameters as
structured adapter evidence. The function uses invoker rights, so normal grants and RLS remain
authoritative.

Use `relationshipRpcName` or `manyToManyRpcName` only when a project installs the corresponding
function under a non-default name. If `rpc` is unavailable, neither path degrades to a racy
PostgREST read followed by update.

Each RPC is atomic for its one Relationship Command. The Supabase/PostgREST runtime does not
advertise Ontahi's compositional transaction capability: several client requests cannot honestly
share rollback merely because they are sequenced in one Effect. Required multi-mutation
coordination needs a server-side Operation or RPC that owns its database transaction.

Supabase-backed Operations still participate in Ontahi's ordinary UnitOfWork resource scope. That
scope can later coordinate Ref resolution and invalidation, but it does not manufacture a database
session. Calling the contextual `app.graph.transaction(effect)` facade with a Supabase/PostgREST
runtime fails before evaluating `effect`; it never degrades into sequential client requests.
