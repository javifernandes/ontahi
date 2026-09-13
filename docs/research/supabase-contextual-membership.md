# Supabase contextual membership: PostgREST feasibility

Status: native provider implementation complete locally; release and BookOps migration pending.

## Implementation checkpoint — 2026-09-13

The native lowering below is now implemented in `@ontahi/supabase`. Query/get/count/buffered stream
accept contextual Selections with the existing `entities` registry. Shared scalar serialization,
independent scoped embeds, exact count metadata, and result materialization preserve the same AST
without source-ID prefetch. Negation serialization was corrected to valid PostgREST Boolean syntax.

The tests now also execute canonical Selections through Supabase's actual PostgREST client 2.98.0
and Ontahi's runtime. Graph Read v2 negotiation and source/intermediate/target policies are tested
separately from database RLS; a denied hop never reaches the runtime. Protocol v1 and Commands
remain closed. Invalid registries, unsafe identifiers, virtual filters and unsupported mappings
fail explicitly. See the [package contract](../../packages/supabase/README.md#contextual-selection-reads)
for physical-schema requirements and remaining restrictions.

The feasibility notes below record the earlier experiment, before runtime integration. No hosted
Supabase instance, BookOps database, package pin, or source file was modified.

Verification: 92 package tests passed with coverage, including 13 real PostgREST cases and eight
compiler-boundary tests. Typecheck, lint, all 15 package builds, repository formatting and the
installed-tarball consumer proof passed. The contextual compiler has 100% line coverage.

## Initial feasibility decision — 2026-09-13

Implement a bounded native PostgREST lowering for contextual Selection reads before release if
the provider work stays within the constraints below. The BookOps-shaped self-navigation example
works without a generic SQL RPC, custom SQL functions, or source-ID prefetch. This is a promising
provider implementation task, not evidence that Supabase already accepts `relation-image` ASTs.

MySQL was enabled first through the existing shared SQL compiler (commit `4a2a7ee`). Supabase
cannot simply enable that compiler because it talks PostgREST, but it can preserve the same
canonical membership semantics through a different backend lowering.

## Reproducible evidence

The colocated [integration proof](../../packages/supabase/src/data-graph/contextual-membership.postgrest.integration.test.ts)
runs PostgreSQL `17-alpine` and PostgREST `v13.0.0` in disposable containers. It creates synthetic
Book/ContentNode-shaped tables, a self foreign key, and many-to-many edges. These are not BookOps
data, migrations, or a hosted Supabase deployment. The host's deployed PostgREST version remains
unverified.

HTTP requests execute as a dedicated non-owner, non-superuser role through a `NOINHERIT`
authenticator. RLS applies independently to source books, intermediate/target nodes and edge rows.
Database administration uses a separate test-only owner connection. No application credentials
or service-role bypass are involved.

Run with Docker available:

```sh
pnpm --filter @ontahi/supabase exec vitest run src/data-graph/contextual-membership.postgrest.integration.test.ts
```

Eight cases establish:

- Source filtering and two-hop self navigation return final chapter rows in one HTTP request.
- Empty embeds do not add source rows or internal aliases to the returned JSON.
- Final limit preserves the exact total count (`0-0/2` for two matches limited to one), supplying
  the metadata needed for Ontahi's existing exact-one validation.
- Complement, conjunction, union and independently filtered aliases preserve membership.
- Source, intermediate and target RLS remain active, including under complement.
- Many-to-many shared targets appear once; source and edge RLS constrain their membership.
- The next request sees changed source membership; no caller-side materialized ID set is retained.
- A relation absent from the physical FK catalog is rejected, not inferred from column names.

The full Supabase suite passed: 79 tests including the eight PostgREST cases. This proves HTTP
transport behavior only: the new tests deliberately do not pretend to run Ontahi's AST compiler,
Graph Read v2 receiver, or the Supabase JavaScript client.

## The important self-relation finding

For the conceptual Selection:

```ts
Book.by({ slug: 'book-one' }).parts.chapters;
```

the final resource is `nodes`. A native request can express membership with these parameters:

```text
select=id,p:parent_id(b:books())
p.node_type=eq.part
p.b.slug=eq.book-one
p.b=not.is.null
p=not.is.null
node_type=eq.chapter
order=id.asc
```

`p` is the candidate chapter's parent; `b` is that parent's book. The aliases are backend-owned
existence probes, not caller-visible projections. The test returns only `[{id: "c1"}, {id: "c2"}]`.

An initial `p:nodes!nodes_parent_id_fkey(...)` attempt returned `PGRST200`. A computed
`parent_node(nodes)` function worked in an intermediate experiment, but was unnecessary:
`p:parent_id(...)` succeeds using the existing self-FK column. The final test fixture installs
**no custom functions**. Do not infer from the failed hint that BookOps needs another migration.

The official [resource embedding documentation](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html)
describes FK-backed embeddings, existence filtering, empty embeds and computed relationships for
recursive cases. The concrete column-based self-navigation result above is local execution evidence,
not a claim that every recursive graph shape is automatically supported.

## Smallest production slice

1. Consume the same canonical `SelectionExpression` and receiver-owned Entity registry. Resolve
   source/relation/target names against trusted declarations, not caller-supplied join strings.
2. Lower each relation image to an independent empty embed plus an existence condition. Keep
   source predicates inside the corresponding embed; preserve target predicates and `and/or/not`
   at their membership boundary. Reuse scalar predicate/value escaping and existing read shaping.
3. Resolve physical PostgREST relationship names from declared mappings where unambiguous. Permit
   narrowly scoped receiver-owned overrides only where required. Ontahi relation declarations
   alone do not prove that PostgREST has a matching physical FK relationship in its schema cache.
4. Wire the lowering into query, get, count and buffered stream. Retain exact count metadata and
   the `one + limit(0)` rejection. Keep result projections separate from filtering embeds.
5. Verify actual Supabase-client execution and Graph Read v2 per-hop authorization, scope
   placement, missing mappings, quoted values, alias collisions and unsupported cases before
   advertising any new provider capability. RLS proof does not replace protocol authorization.

This requires more than the two MySQL opt-in lines: the current Supabase runtime calls the flat
Core planner, and its selection compiler only represents scalar/Boolean filters, not relationship
embeds. The adapter must carry the embed plan into `.select(...)` and scoped filters. Generic
Selection validation belongs in Core; PostgREST URL syntax and physical relationship resolution
belong in `@ontahi/supabase`, not in the SQL compiler or a new domain abstraction.

## Boundaries and release gate

- Keep unsupported joins closed: missing FKs, ambiguous relationships, unsupported physical
  mappings and composite edge cases must not broaden the target set.
- Existing BookOps `book_id` and `parent_id` FKs are a promising fit, not an installed-host proof.
- No contextual Commands, observation support, automatic migrations or generic SQL executor.
- Do not switch BookOps to a privileged direct PostgreSQL connection to make tests pass.
- If a representative host mapping requires broad schema infrastructure, split that extension
  from the supported native subset and revisit release scope explicitly.

Related: [120b](../../plans/done/120b-contextual-selection-factories.md),
[release inventory](./release-readiness-bookops-2026-09.md),
[Selection model](../../atlas/items/model/selection.md).
