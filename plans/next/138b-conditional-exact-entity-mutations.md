# 138b. Conditional Exact Entity Mutations

Status: next

Parent plan: [138. Entity Mutation Command Authoring And Lifecycle Ergonomics](../current/138-entity-mutation-command-authoring.md)

Predecessor: [138a. Client Entity Mutation Authoring](../done/138a-client-entity-mutation-authoring.md)

Canonical ID: `ontahi://plans/138b-conditional-exact-entity-mutations`

## Summary

Add portable concurrency evidence to exact Ref-targeted Entity update and delete Commands so a
caller can require that the authoritative target still matches the state it observed. Apply the
condition atomically with the mutation in every supported direct and remote runtime, and return one
structured outcome for missing, stale, or replaced targets without pre-reading for authorization.

The final authoring spelling remains an evidence-led decision. A representative target is:

```ts
const result = yield * enrollment.update(changes, { ifRevision: revision }).run();
```

The revision token is illustrative, not an accepted restriction to one storage versioning scheme.

## Scope

1. Inventory version, timestamp, field-comparison, and provider-native concurrency evidence already
   available in Entity definitions, mappings, Commands, and mutation results.
2. Define one JSON-safe exact-mutation precondition contract and its typed Entity/Ref facade.
3. Apply target identity, authority scope, and concurrency condition in one mutation statement or
   provider request; never authorize or classify by reading first and mutating later.
4. Preserve identical command and outcome semantics in-memory, PostgreSQL, Supabase, the versioned
   remote protocol, Fetch, and runtime-bound `.run()`.
5. Define safe structured diagnostics for missing, stale, and replaced targets, including what may
   collapse to one rejection when authority cannot reveal existence.
6. Reflect the portable condition and runtime guarantee separately where execution planning needs
   to distinguish local, bridged, and unavailable capability.
7. Update Plan 138, Atlas, developer guidance, and a public Changeset.

## Non-Goals

1. No bulk or Selection concurrency contract, upsert, arbitrary predicate mutation, or generic
   provider Command transport.
2. No client cache invalidation, optimistic UI, Explorer editing UX, or offline conflict resolver.
3. No Relation `ifCurrent` rewrite; reuse its proven compare-and-set semantics only where the Entity
   contract genuinely shares them.
4. No promise that every provider can distinguish every rejection reason under row policy.

## Acceptance Checklist

- [ ] One portable precondition shape is typed from exact Entity mutation authoring through every
      supported executor and transport.
- [ ] Update/delete apply identity, policy scope, and precondition atomically with the mutation.
- [ ] Missing, stale, and replaced outcomes are structured, stable, and authority-safe.
- [ ] Direct PostgreSQL, Supabase, in-memory, and remote execution preserve equivalent semantics.
- [ ] Unsupported runtime evidence fails explicitly before provider work.
- [ ] Semantic tests cover success, concurrent change, deletion, policy-filtered targets, and wire
      round-trips without snapshot-only assertions.
- [ ] Focused tests, coverage, typecheck, lint, formatting, build, artifacts, and Changeset status
      pass.
- [ ] Plan 138, Atlas, developer guidance, and the Changeset describe the final concurrency model.
