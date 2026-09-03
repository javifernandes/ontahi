# 142c. Reflected Atomic Operation Execution

Status: done

Canonical ID: `ontahi://plans/142c-reflected-atomic-operation-execution`

Parent: [142. Declarative Model Semantics And Execution Planning](./142-declarative-model-semantics-and-execution-planning.md)

Related plans:

1. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
2. [139a. Composable Data Graph Transactions](./139a-composable-data-graph-transactions.md)
3. [139b. Transaction-Scoped Unit Of Work](./139b-transaction-scoped-unit-of-work.md)

## Summary

Make Data Graph atomicity an explicit, reflected Domain Operation guarantee rather than an
imperative transaction call hidden in the Operation body. Add `operation.atomic({...})`, derive the
smallest provider-neutral execution requirement from that declaration, let the server runner own
the existing compositional transaction boundary, and expose a separate runtime affordance that can
report local, bridge, or unavailable execution.

## Risk To Prove

Ontahí already has compositional PostgreSQL transactions and an Operation bridge, but the current
Classroom transfer selects both manually. Reflection cannot distinguish an atomic Operation from an
ordinary one, a client cannot explain whether its current binding will execute locally or bridge,
and the server can enter the body before discovering that storage lacks transaction support.

The main risk is confusing three independent facts: the model requires atomic Data Graph execution;
a live runtime can satisfy that requirement; and a configured bridge can route the invocation to
another authority. The slice must keep those facts separate while preserving one invocation API.

## Scope

1. Add `operation.atomic({...})` as the ergonomic server authoring factory and reflect only
   `execution.atomicity: 'required'` in the Operation declaration.
2. Derive `data-graph.atomicity` as a capability requirement from that metadata; do not accept a
   second author-maintained capability list.
3. Make the ordinary server runner start or reuse the Data Graph transaction around Operation
   requirements, pre-checks, the body, and post-checks.
4. Fail before pre-checks or body evaluation when the authoritative runtime cannot provide the
   required local atomic boundary.
5. Preserve the static execution metadata through graph reflection and generated client Entities.
6. Add a provider-neutral planner that combines static requirements with explicit live local and
   bridge bindings and returns `local`, `bridge`, or `unavailable`.
7. Let the existing reflected React invoker expose that affordance while keeping invocation
   topology-transparent; show the static requirement and current affordance in Explorer.
8. Migrate `Student.transfer(...)` to `operation.atomic({...})` and remove its manual
   `app.graph.transaction(...)` wrapper.

## Non-Goals

1. No declarative precondition/postcondition language, `existingRef`, derived Field, or permanent
   Relation invariant.
2. No generic remote Entity Command protocol or direct Relationship Command UI.
3. No Supabase/PostgREST emulation of compositional transactions or compilation of an atomic
   Operation into a focused RPC.
4. No queue, replication, convergence, retry, savepoint, isolation-level, or distributed
   transaction model.
5. No provider name, bridge name, or authority binding in static Operation metadata.
6. No manually authored `requiredCapabilities` array and no generic execution `scope` or
   `consistency: 'strict'` flag.
7. No claim that a bridge route proves the remote authority remains healthy; authoritative
   execution still validates its own capabilities and policy.
8. No atomicity claim across durable scheduling and deferred task execution; the factory rejects
   that combination until a durable execution boundary is designed explicitly.

## Intended Contract

```ts
transfer: operation.atomic({
  input: TransferStudentInput,
  run: ({ student, previousCourse, nextCourse }) =>
    Effect.gen(function* () {
      // Reads and Commands use the transaction-scoped UnitOfWork transparently.
    }),
});
```

Portable reflection:

```ts
{
  execution: {
    atomicity: 'required',
  },
}
```

Runtime planning remains a separate value:

```ts
type OperationExecutionAffordance =
  | { status: 'local'; runtime: string }
  | { status: 'bridge'; authority: string; bridge: string }
  | {
      status: 'unavailable';
      missingCapabilities: readonly [{ kind: 'data-graph.atomicity' }];
    };
```

## Acceptance Checklist

- [x] `operation.atomic` is typed, preserves the ordinary Operation declaration shape, and emits
      the single static atomicity requirement.
- [x] Required capabilities are derived from metadata rather than separately authored.
- [x] Successful atomic Operations commit pre/body/post Data Graph work as one boundary.
- [x] A precondition, body, or postcondition failure rolls back the complete boundary.
- [x] Missing local transaction capability prevents pre-check and body evaluation and produces a
      safe structured execution-unavailable result.
- [x] Nested atomic Operations reuse an active boundary rather than opening a second transaction.
- [x] Codegen and graph/Explorer reflection preserve atomicity metadata semantically.
- [x] Runtime planning distinguishes local, bridge, and unavailable without embedding topology in
      the Operation model.
- [x] Reflected React/Explorer execution uses the planner result but invokes through the same
      Operation facade.
- [x] Classroom transfer no longer opens or catches a transaction manually.
- [x] Focused tests, affected package suites, typecheck, lint, build, format, and Changesets pass.

## Split Point

Stop once one code-bodied atomic Operation is authorable, reflected, routed, and enforced through
the existing transaction/bridge primitives. The next Plan 142 slice owns declarative Ref and
condition contracts; provider compilation and distribution remain later work.

## Closure

Completed 2026-08-28. `Student.transfer` is the executable proof: its declaration now owns the
atomicity guarantee while PostgreSQL supplies the existing transaction capability and
transaction-scoped UnitOfWork. The runtime planner is intentionally separate from portable
metadata; React and Explorer report local, bridge, or unavailable execution without changing the
invocation facade. Required atomicity is fail-closed: legacy invokers without an explicit
affordance cannot execute it, generated modules preserve both supported public authoring forms,
and durable Operations cannot claim a boundary that ends before their deferred body runs.

Verification included focused red/green tests, the complete Core, codegen, React, Explorer React,
and Classroom suites, all five Classroom PostgreSQL integration scenarios, repository typecheck,
lint, package builds, formatting, coverage, Changesets status, and clean-room package artifact
verification.
