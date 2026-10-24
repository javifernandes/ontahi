# 157. Bartlett Consumer Ergonomics

Status: current

## Summary

The Bartlett reconstruction application exercised Ontahí alpha.13 as an external Next.js,
Supabase and React consumer. It exposed two recurring authoring costs and one lifecycle ambiguity:

1. Graph Read policies require repetitive low-level Field capability objects even when the host
   wants an explicit select/filter/order allowlist.
2. A conventional Supabase-backed Ontahí application must separately apply mappings, construct the
   runtime, construct reflected Entity reading and assemble `DataGraphDefaultStorage`.
3. `useOperation().executeAsync()` waits for post-success invalidation, while `onSuccess` runs
   before that wait. This is intentional on current `main`, but the distinction is not visible in
   the primary consumer guidance and led confirmation dialogs to appear stuck after a committed
   mutation.

This plan converts that application evidence into two small public authoring APIs and explicit
operation-refresh guidance. The Bartlett host remains the external compatibility proof after the
packages are released.

## Scope

### Graph Read policy authoring

Add a typed constructor that accepts explicit capability lists and lowers them to the existing
`GraphReadPolicy` contract without changing dispatcher behavior:

```ts
defineGraphReadPolicy({
  entity: AnalysisRun,
  modes: ['get', 'run', 'count'],
  cardinalities: ['one', 'many'],
  maxLimit: 100,
  allow: {
    select: ['id', 'experiment', 'status', 'analyzerVersion', 'createdAt'],
    filter: {
      id: ['eq', 'in'],
      experiment: ['eq', 'in'],
      status: ['eq', 'in'],
    },
    order: ['createdAt'],
  },
  scope: authenticatedScope,
});
```

Selecting, filtering and ordering remain separate authorization grants. The constructor must reject
unknown Fields at compile time and produce the same policy shape consumed by the dispatcher.

### Supabase storage composition

Add `createSupabaseDataGraphStorage` to `@ontahi/supabase/data-graph`. It accepts a host-created
client, optional naming/mapping overrides and the existing error factory. The application bind
supplies registered Entities, applies mappings once and returns a complete
`DataGraphDefaultStorage`, including reflected Entity reading.

Ontahí will not read environment variables or create a Supabase client. Credential source, service
role versus user-scoped client, session behavior and deployment configuration remain host-owned.

### Operation completion and refresh

Preserve the compatible lifecycle on current `main`: `onSuccess` observes a successful invocation
before query invalidation finishes, while `executeAsync()` settles after invalidation. Document the
distinction beside the primary `useOperation` example and add/retain focused regression coverage.
Hosts that must close a dialog or navigate immediately after commit should use `onSuccess`; code
that requires refreshed reads may await `executeAsync()`.

## Non-goals

- Replacing `GraphReadPolicy` or weakening its explicit authorization boundary.
- Inferring policy permissions from arbitrary application queries.
- Reading Supabase credentials or environment variables inside Ontahí.
- Changing the default `executeAsync()` settlement contract in this release.
- Releasing packages before the Bartlett compatibility update passes against packed artifacts.

## Execution slices

1. Add and verify typed Graph Read policy authoring in `@ontahi/core`.
2. Add and verify conventional Supabase Data Graph storage composition in `@ontahi/supabase`.
3. Reconcile React operation lifecycle documentation and regression coverage.
4. Add Changesets, build and verify publishable artifacts.
5. Install packed artifacts into Bartlett, migrate its policies/storage/operation callbacks, and
   run its full verification suite.
6. Merge the framework work, publish one prerelease through the release PR, and pin Bartlett to the
   exact released version.

## Acceptance checklist

- [x] A host can author the Bartlett read-policy Field grants without nested per-Field capability
      objects.
- [x] The new policy constructor is type-safe and dispatcher-compatible.
- [x] A host can assemble the Bartlett Supabase storage through one exported factory while
      retaining ownership of the client and error type.
- [x] Reflected Entity data uses the same client and Entity registry as Graph reads and commands.
- [x] Operation documentation distinguishes committed success callbacks from awaited refresh.
- [x] Directly affected public packages have Changesets.
- [x] Focused tests, package build/typecheck/lint and artifact verification pass.
- [x] Bartlett passes codegen, typecheck, tests and production build against the candidate packages.

## Durable model impact

This plan refines the authoring surface of
[`Authority And Policies`](../../atlas/items/authority-and-policies.md) without changing its
authorization semantics. Supabase storage composition is an adapter convenience rather than a new
runtime capability. Operation callback timing clarifies the existing React lifecycle rather than
introducing a new operation state.
