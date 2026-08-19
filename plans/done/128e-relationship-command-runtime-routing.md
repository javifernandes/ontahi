# 128e. Relationship Command Runtime Routing

Status: done

Parent plan: [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)

Source plan: [128d. Relationship Command Policy And Dispatcher](../done/128d-relationship-command-policy-dispatcher.md)

Canonical ID: `ontahi://plans/128e-relationship-command-runtime-routing`

## Summary

Execute the same canonical Relationship Command through either the in-memory capability or a remote
transport connected in-process to the default-deny dispatcher. Keep this capability separate from
generic Entity Graph Commands until their wire semantics and policy model exist.

## Scope

1. Define a focused `RelationshipCommandExecutionRuntime` capability.
2. Add it to the in-memory runtime using the proven Relationship Command executor.
3. Let the dispatcher bind directly to that capability without storage-specific knowledge.
4. Add an optional remote Relationship Command transport beside the existing read transport.
5. Encode requests and validate command results/protocol errors in the remote runtime.
6. Prove direct and remote in-process execution return identical deltas and state.

## Non-Goals

1. No broadening of generic `GraphCommandSpec`, Entity insert/update/delete transport, or provider
   adapter contract.
2. No HTTP, Express, Next.js, Fetch, React, codegen, cache, telemetry, or Explorer integration.
3. No Principal evaluator or domain invariant hooks.
4. No PostgreSQL/Supabase implementation; unsupported providers simply lack the focused capability.

## Acceptance Checklist

- [x] In-memory runtime exposes Relationship Command execution without changing generic Graph Command APIs.
- [x] Dispatcher execution can be bound to a Relationship Command runtime capability.
- [x] Remote runtime transports the canonical request and returns an exact Relationship Delta.
- [x] Runtime options remain outside the serialized request.
- [x] Missing transport reports `unsupported_capability`; malformed results, protocol errors, and
      transport failures retain distinct remote errors.
- [x] Direct and remote in-process proofs produce identical state and deltas.
- [x] Tests, typecheck, lint, formatting, builds, and Changeset status pass.

## Decisions

1. `RelationshipCommandExecutionRuntime` is a focused capability parallel to
   `DataGraphExecutionRuntime`, not a widening of generic `GraphCommandSpec`.
2. The in-memory runtime accepts authoritative Entity definitions only when this capability is
   needed; existing read and Entity Command callers remain unchanged.
3. Remote read and Relationship Command transports are injected independently. A missing command
   transport yields `unsupported_capability` without invoking the read transport.
4. Runtime options are passed only to the transport callback and never encoded into the request.
5. Remote results validate every Relationship Fact before returning a delta.

## Closure

- Status: done
- Closed on: 2026-08-19
- Effective effort: ~1-2h focused implementation and verification
- Outcome: identical canonical Relationship Commands now execute directly or through a remote
  in-process route without HTTP or provider coupling.
- Verification:
  - full Core suite: 69 files and 506 tests passed;
  - Core typecheck and lint passed;
  - all package builds passed;
  - formatting, `git diff --check`, and Changeset status passed.
- Next slice: expose the already transport-neutral capability through one HTTP adapter, then decide
  whether the fluent authoring facade or authorization integration should come next.
