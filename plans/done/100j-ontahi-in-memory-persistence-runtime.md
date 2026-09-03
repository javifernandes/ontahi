# 100j. Ontahi In-Memory Persistence Runtime

Status: done

Canonical ID: `ontahi://plans/100j-ontahi-in-memory-persistence-runtime`

Migrated from: `bookops://plans/100j-ontahi-in-memory-persistence-runtime`
Original path: `plans/done/100j-ontahi-in-memory-persistence-runtime.md`
Source commit: `cb9c038a`

Parent plan: [`100. Ontahi Framework Extraction`](../done/100-ontahi-framework-extraction.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Shapes: [`Runtime Capability Model`](ontahi://atlas/application-architecture-surface/runtime-capabilities)

## Summary

Turn the existing read-only in-memory graph runtime into Ontahi's complete zero-infrastructure reference implementation for authoritative graph state.

## Scope

1. Keep the implementation in `@ontahi/core`; in-memory state is the framework baseline, not a technology package.
2. Support the full `DataGraphExecutionRuntime` surface: reads, relation-root reads, streams, counts, and commands.
3. Implement insert, bulk insert, upsert, update, and delete with canonical predicates, `returning`, and cardinality behavior.
4. Keep seeded state live and observable so tests and local hosts can arrange data without private adapters.
5. Provide reflected entity data reads for Explorer without Supabase.
6. Remove consumer-side no-op execution shims made necessary by the current read-only runtime.

## Non-Goals

1. No durability across process restarts, transactions, indexes, migrations, or database constraints.
2. No direct PostgreSQL adapter.
3. No new `@ontahi/in-memory` package.
4. No example application in this plan; it remains Plan 100h's portability proof.

## Execution Slices

- [x] Complete query, relation-root, stream, and count behavior.
- [x] Add mutable command execution and explicit in-memory failures.
- [x] Add reflected data reading and consumer-level tests.
- [x] Update public docs and remove obsolete test shims.

## Verification

- [x] The runtime satisfies `DataGraphExecutionRuntime` with separate read and command error channels.
- [x] Reads observe inserts, updates, upserts, and deletes through the same seeded state.
- [x] Command tests cover every operation, `returning`, and one-row cardinality failures.
- [x] Relation-root modes and reflected Explorer reads work without an external service.
- [x] Core typecheck, lint, and 283 tests pass; BookOps typecheck and the affected 41 runtime tests pass.

## Closure / Evolution

Complete. A small Ontahi host can now use graph persistence and Explorer entirely in memory through public core APIs. Process durability, PostgreSQL, and the example application remain separate follow-ups under the broader Goal.
