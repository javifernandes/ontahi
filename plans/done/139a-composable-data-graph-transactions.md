# 139a. Composable Data Graph Transactions

Status: done

Canonical ID: `ontahi://plans/139a-composable-data-graph-transactions`

Parent: [139. Relations Lifecycle Release Proof](./139-relations-lifecycle-release-proof.md)

Related plans:

1. [135. Applied Mutation Outcomes And Reactions](./135-applied-mutation-outcomes-and-reactions.md)
2. [136. Relation Constraints And Eligibility Semantics](../current/136-relation-constraints-and-eligibility.md)

## Summary

Define one honest, optional Data Graph runtime capability that composes several required reads and
mutations inside a shared storage transaction. Prove that capability with a checked-out PostgreSQL
connection and observable commit/rollback behavior before adding Classroom domain syntax.

```ts
runtime.transaction(tx =>
  Effect.gen(function* () {
    yield* tx.runRelationshipCommand(student.course.assign(nextCourse, { ifCurrent: current }));
    yield* tx.runCommand(updateCourseCapacity);
  }),
);
```

The callback receives the transaction-scoped runtime. Commands executed through another runtime
are not part of the transaction. A successful Effect commits; failure or defect rolls back. This
is required coordination before an Applied Mutation Outcome, not a post-application Reaction.

## Risk To Prove

Ontahi currently guarantees atomicity only inside one provider command. Sequencing two Effects in
an Operation does not bind them to one connection and cannot honestly promise shared rollback. The
smallest useful proof is therefore the runtime boundary itself: one callback, one transaction-
scoped runtime, and one PostgreSQL connection used by every read and command in that callback.

## Scope

1. Add a technology-independent optional transaction capability contract in Core.
2. Preserve the callback's success value and typed failure channel.
3. Implement PostgreSQL `BEGIN`, `COMMIT`, and `ROLLBACK` on one checked-out client.
4. Prove that two mutations commit together and that a later failure rolls both back.
5. Make unsupported runtimes visible by capability absence rather than simulated atomicity.
6. Document the distinction between required coordination and Reactions in the Relation Atlas.

## Non-Goals

1. Do not transport transaction callbacks or arbitrary code over the remote graph bridge.
2. Do not emulate a multi-request transaction over Supabase/PostgREST.
3. Do not add nested transactions, savepoints, retries, isolation-level authoring, or distributed
   transactions.
4. Do not register Reactions or emit Applied Mutation Outcomes in this slice.
5. Do not build Classroom yet; the example follows after the primitive is proven.
6. Do not add generic remote Entity Commands.

## Acceptance Checklist

- [x] Core exposes a provider-independent optional transaction capability whose callback receives
      a transaction-scoped runtime.
- [x] PostgreSQL uses one checked-out client for the complete callback.
- [x] Successful work commits all included mutations and returns its result.
- [x] Failed work rolls back all included mutations and preserves the failure.
- [x] The transaction runtime does not advertise nested transactions in this first version.
- [x] Supabase and remote runtimes do not claim this capability.
- [x] Focused tests, Core/PostgreSQL typecheck, lint, formatting, and artifact verification pass.
- [x] Public package changes include a Changeset and durable Relation documentation is updated.

## Decisions

1. Transaction is an execution capability, not Relation metadata and not a portable Command.
2. The callback accepts an Effect so Ontahi preserves typed domain and infrastructure failures.
3. Provider acquisition, commit, rollback, and release belong to the adapter; Core only defines
   the semantic lifetime.
4. The first PostgreSQL transaction runtime deliberately omits the transaction method, so nested
   behavior cannot be inferred accidentally.

## Delivery

Core now exposes `DataGraphTransactionCapability` as an optional provider-independent runtime
contract. Its callback receives the runtime whose executions participate in the boundary and keeps
the callback result, typed failure, and Effect requirements intact.

`createPostgresDataGraphRuntime(...)` advertises that capability when its input is a PostgreSQL
`Pool`. Execution checks out one client, begins the transaction, constructs a query-capable runtime
over that client, and commits only after the callback succeeds. A typed failure, interruption, or
defect rolls back before release. Transaction work is suspended until after `BEGIN`, so synchronous
construction failures enter the same rollback path. A failed rollback does not replace the original
work cause. The scoped runtime is intentionally query-only and therefore cannot recursively start
another transaction. A lower-level query-only runtime, Supabase, and the remote runtime remain
non-transactional.

The Relation Atlas and provider READMEs now distinguish single-command atomicity, required
multi-command coordination, and post-application Reactions. The public Core and PostgreSQL changes
are recorded in `.changeset/brave-transactions-compose.md`.

## Verification

1. Core focused transaction contract: 2 tests passed.
2. PostgreSQL focused transaction lifecycle: 5 tests passed.
3. Complete Core suite: 81 files and 562 tests passed.
4. Complete PostgreSQL suite: 8 files and 68 tests passed, including 34 tests against an ephemeral
   PostgreSQL instance.
5. All ten package typechecks passed.
6. Core and PostgreSQL lint and builds passed.
7. Repository formatting and Changeset status passed.
8. Clean-room package artifact install, typecheck, and runtime verification passed.
