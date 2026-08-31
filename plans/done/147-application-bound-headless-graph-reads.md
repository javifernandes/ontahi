# 147. Application-Bound Headless Graph Reads

Status: done

Canonical ID: `ontahi://plans/147-application-bound-headless-graph-reads`

Related plans:

1. [74a. Unit Of Work Runtime Scope](./74a-unit-of-work-runtime-scope.md)
2. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
3. [146. Ontahí Runtime Protocol](../current/146-ontahi-runtime-protocol.md)

## Summary

Give host applications a small, canonical way to execute semantic Graph reads without manually
assembling a server Effect scope or installing the Data Graph runtime concern:

```ts
const item = await application.graph.read(
  query(AtlasItem)
    .where(item => item.id.eq(itemId))
    .one(),
  { scope: 'atlas.item-context' },
);
```

The application boundary pins the configured storage runtime for that exact application and
interprets Query terminal intent consistently for plain Query reads, `first()`, `one()`, `count()`,
and `exists()`. Runtime-bound APIs inside Operations remain explicit Effects.

## Current Evidence

1. A headless host can currently execute a read with `runServerEffect`,
   `application.app.graph.getViewEffect`, and `application.app.graph.withRuntime()`, but this leaks
   runtime assembly into application code and is easy to omit.
2. Server Effect defaults install the last globally registered architecture. That is convenient for
   one application but is not a safe identity boundary when multiple applications coexist in one
   process or test suite.
3. `query(Entity).first()`, `.one()`, `.count()`, and `.exists()` produce semantic
   `GraphReadExpression` values. React interprets them, while Core executors accept only the
   underlying Query or View.
4. Every storage runtime already provides `get`, `run`, and `count`; strict `.one()` cardinality is
   represented in the Query and enforced by existing runtimes. No provider-specific execution path
   is needed.

## Scope

1. Add `application.graph.read(read, options?)` to composed Ontahí applications.
2. Return a Promise at this host-application boundary while preserving server runtime context,
   telemetry, concerns, and failure behavior below it.
3. Bind every read to `application.app.graph.withRuntime()` for the exact application instance.
4. Interpret plain Query/View reads as many and terminal expressions as their declared intent:
   `first`, `one`, `count`, or `exists`.
5. Preserve type-safe results, View parameters, and storage read options.
6. Prove behavior with focused headless in-memory runtime and type tests, including two applications
   whose registration order would otherwise select the wrong global runtime.
7. Document the recommended headless host path and the lower-level explicit Effect boundary for
   Operations.

## Non-Goals

1. No React dependency in Core and no React hook redesign.
2. No provider changes, remote protocol changes, Query compiler changes, or new authorization path.
3. No hidden application runtime inside Operation implementations; their runtime-bound APIs remain
   explicit Effects and inherit their current scope.
4. No redesign of recursive or cyclic typed Entity refs. Their declaration-order limitation is a
   separate follow-up.
5. No generic `get`/`run` pair that can contradict the terminal intent already carried by a Query.

## Acceptance Checklist

- [x] Plain Query and View reads return all matching rows through `application.graph.read`.
- [x] `first`, `one`, `count`, and `exists` return their semantic result shapes.
- [x] `.one()` preserves strict cardinality failures from the selected storage runtime.
- [x] Parameterized Views and runtime read options remain type-safe.
- [x] Reads are bound to the exact application even when another application was registered later.
- [x] Operation execution and provider contracts are unchanged.
- [x] Focused tests, Core coverage, typecheck, lint, formatting, build, Changeset status, and package
      artifact verification pass.
- [x] Atlas and developer documentation identify the canonical headless application read path.

## Delivery Evidence

1. Composed applications expose one typed Promise boundary, `application.graph.read(...)`, which
   dispatches plain reads and Query terminals through the existing runtime `run`, `get`, and
   `count` primitives.
2. The boundary enters the ordinary server Effect lifecycle using that application's complete
   architecture defaults, including its `withRuntime()` concern. A regression with two coexisting
   in-memory applications proves a read neither constructs nor uses the other application's
   runtime.
3. Parameterized Views require `params`, provider read options remain inferred, and `.one()` keeps
   the runtime's strict cardinality rejection. Operations and provider interfaces did not change.
4. Verification passed on 2026-08-31: 801 Core tests with coverage; every package typecheck; Core
   lint and build; repository formatting; Changeset status; every package build; and clean-room
   package artifact install, type, and runtime checks.
