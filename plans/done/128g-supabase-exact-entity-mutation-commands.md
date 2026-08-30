# 128g. Supabase Exact Entity Mutation Commands

Status: done

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Predecessor: [128f. Remote Identity-Scoped Entity Mutation Commands](./128f-remote-identity-scoped-entity-mutation-commands.md)

Canonical ID: `ontahi://plans/128g-supabase-exact-entity-mutation-commands`

## Summary

Close the provider gap left deliberately by Plan 128f: make the Supabase Data Graph runtime
advertise and execute the existing focused `EntityMutationCommand` capability for exact create,
identity-scoped update, and identity-scoped delete. Reuse the provider's existing semantic Command
lowering, reference mapping, returning rows, and row-level-security boundary, then materialize the
same portable `EntityMutationDelta` already returned by in-memory, PostgreSQL, and remote runtimes.

## Evidence And Decisions

1. `executeSupabaseGraphCommandEffect` already lowers insert/update/delete, declared Entity column
   mappings, reference Fields, returning rows, exact-one cardinality, and Supabase errors.
2. Each focused Entity mutation is one PostgREST mutation statement. Its exactness does not require
   a new RPC, but it also does not imply a compositional transaction across several requests.
3. The runtime already receives the server-owned Entity registry used by Relationship Commands.
   Entity mutation execution must resolve the command's semantic Entity from that registry rather
   than accepting caller-owned mappings.
4. Exact update/delete cardinality failures must retain structured provider evidence so the
   existing Core/remote boundary can produce `entity_mutation_cardinality_mismatch` consistently.
5. Supabase grants and RLS remain the direct-storage authority boundary. This provider capability
   does not replace or weaken Plan 128f's separate default-deny remote graph policy.

## Scope

1. Add a focused Supabase Entity Mutation Command executor that resolves the registered Entity,
   rebuilds the existing semantic Graph Command, delegates provider lowering, and materializes one
   exact portable delta.
2. Advertise `EntityMutationCommandExecutionRuntime` from `createSupabaseDataGraphRuntime` and route
   `runEntityMutationCommand` through that executor.
3. Preserve structured exact-cardinality evidence through the generic Supabase Command executor
   without changing its existing default error messages.
4. Prove create reference lowering/lifting, exact Ref update/delete selection, delta buckets,
   missing-row diagnostics, and unregistered-Entity rejection with focused semantic tests.
5. Document provider guarantees and update durable Plan/Atlas material plus a public Changeset.

## Non-Goals

1. No new RPC, multi-request rollback, compositional transaction capability, or silent fallback.
2. No generic remote `GraphCommandSpec`, Selection-targeted bulk mutations, upsert, or
   authority-derived mutation scopes.
3. No Entity/Ref authoring facade from Plan 138 and no Explorer mutation UI.
4. No changes to Relation lifecycle, Relationship Command policy, or Domain Operation execution.

## Acceptance Checklist

- [x] Tests fail first for the missing Supabase Entity Mutation Command capability.
- [x] Create lowers reference payloads and returns one created fact with lifted Ref identity.
- [x] Exact update and delete apply the target Ref and return the matching delta bucket.
- [x] Zero-row update/delete preserves structured cardinality evidence for the portable diagnostic.
- [x] Unknown or unregistered Entities fail before a Supabase query is issued.
- [x] The runtime type and implementation advertise `runEntityMutationCommand` without advertising
      compositional transactions.
- [x] Supabase README, Plan 128, Atlas, and a public Changeset describe the provider parity.
- [x] Focused tests, Supabase coverage, typecheck, lint, formatting, and build pass.

## Closure

- Status: done
- Closed on: 2026-08-30
- Outcome: the Supabase Data Graph runtime now implements the same focused exact Entity mutation
  capability as the in-memory, PostgreSQL, and remote runtimes. It reuses existing PostgREST
  Command lowering, declared Entity/Ref mappings, exact returning cardinality, and portable delta
  materialization without claiming compositional transactions.
- Verification:
  - the focused red test failed because `runEntityMutationCommand` was absent, then all 5 semantic
    Entity mutation tests passed;
  - 58 non-container Supabase tests passed with package coverage (82.61% statements, 83.22% lines);
  - the existing 3-test Relationship RPC integration suite could not start locally because no
    container runtime was available and remains delegated to CI;
  - Supabase typecheck, lint, formatting, build, and Changeset status passed;
  - all public packages built and passed clean-room tarball install, type, and runtime checks.
- Follow-up: Plan 138 owns final Entity/Ref-bound authoring ergonomics. Plan 128 separately retains
  bulk/upsert, authority-derived atomic row scopes, React affordances, and broader execution routing.
