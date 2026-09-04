# 138b. Conditional Exact Entity Mutations

Status: done

Parent plan: [138. Entity Mutation Command Authoring And Lifecycle Ergonomics](./138-entity-mutation-command-authoring.md)

Predecessor: [138a. Client Entity Mutation Authoring](../done/138a-client-entity-mutation-authoring.md)

Canonical ID: `ontahi://plans/138b-conditional-exact-entity-mutations`

## Summary

Add a portable condition to exact Ref-targeted Entity update and delete Commands. Every supported
runtime must test the condition and apply the mutation atomically: PostgreSQL uses one statement,
Supabase uses one provider request, in-memory uses one mutation boundary, and remote execution
transports the same Command. No implementation may read the target and then mutate it.

The final authoring spelling remains an evidence-led decision. A representative target is:

```ts
const result = yield * enrollment.update(changes, { if: { revision } }).run();
```

The example is illustrative. The first slice should accept equality evidence over explicitly
authorized stored Fields rather than require one provider-specific revision mechanism.

## Scope

1. Define one JSON-safe equality condition over stored Entity Fields and expose it through the typed
   Entity/Ref authoring facade.
2. Apply target identity and the condition in one mutation statement or provider request, inside the
   existing graph policy and provider authorization boundary; never read first to classify or
   decide whether to mutate.
3. Require remote mutation policy to allow condition Fields explicitly, separately from writable
   and returned Fields.
4. Preserve the same Command and rejection semantics in-memory, PostgreSQL, Supabase, the versioned
   remote protocol, Fetch, and runtime-bound `.run()`.
5. Return one authority-safe `condition_not_met` rejection when a conditional mutation affects no
   target. It intentionally does not reveal whether the target is missing, stale, replaced, or
   hidden by policy.
6. Keep this as an Entity Mutation Command in the Data Graph Command message family described by
   [Plan 146](./146-ontahi-runtime-protocol.md); do not create another endpoint or protocol.
7. Update Plan 138, Atlas, developer guidance, and a public Changeset.

## Non-Goals

1. No bulk or Selection concurrency contract, upsert, arbitrary predicate mutation, or generic
   provider Command transport.
2. No client cache invalidation, optimistic UI, Explorer editing UX, or offline conflict resolver.
3. No Relation `ifCurrent` rewrite; reuse its proven atomic compare-and-set guarantee only where the
   Entity contract genuinely shares it.
4. No attempt to distinguish missing, stale, replaced, or policy-hidden targets after a condition
   affects zero rows.
5. No multi-Command transaction guarantee. One conditional mutation is atomic; an Operation with
   several mutations still requires `operation.atomic(...)`.

## Acceptance Checklist

- [x] One portable condition shape is typed from exact Entity mutation authoring through every
      supported executor and transport.
- [x] Update/delete apply identity and condition atomically with the mutation after policy accepts
      the request.
- [x] A zero-row conditional mutation produces one stable, authority-safe rejection without a
      classification read.
- [x] Direct PostgreSQL, Supabase, in-memory, and remote execution preserve equivalent semantics.
- [x] Remote policy explicitly allowlists condition Fields and otherwise denies before execution.
- [x] Semantic tests cover success, changed/deleted targets, denied condition Fields, atomic provider
      lowering, and wire round-trips without snapshot-only assertions.
- [x] Focused tests, coverage, typecheck, lint, formatting, build, artifacts, and Changeset status
      pass.
- [x] Plan 138, Atlas, developer guidance, and the Changeset describe the final concurrency model.

## Protocol Compatibility Decision

Adding an optional condition to a version-1 request would be unsafe: an older server could discard
the unknown key and perform an unconditional mutation. Conditional Entity Mutation Commands must
therefore use a protocol version that an older dispatcher rejects before execution. Unconditional
version-1 Commands remain accepted during the transition.

## Closure

- Status: done
- Closed on: 2026-08-30
- Outcome: exact update/delete accept `{ if: { field: expectedValue } }`; Core lowers identity and
  equality evidence into one target Selection; PostgreSQL emits one conditional statement,
  Supabase one filtered provider request, and in-memory one mutation boundary. Remote execution uses
  graph-command protocol version 2 so older receivers fail before executing a weaker mutation.
- Authority: condition Fields have a policy allowlist independent from writable and returned Fields;
  a zero-row conditional mutation becomes `entity_mutation_condition_not_met` without an existence
  or classification read.
- Application proof: TodoApp renames an item only while its observed title remains current, and a
  repeated stale request is rejected without changing the item.
- Verification: focused Core, PostgreSQL, Supabase, and Todo tests passed; full Core tests, package
  unit tests, repository typecheck, touched lint, formatting, package builds, clean-room artifact
  verification, Changeset status, and diff checks passed. Provider integration suites remain covered
  by CI because no local container runtime was available.
- Follow-up: [Plan 146](./146-ontahi-runtime-protocol.md) generalizes the versioned Graph Command
  evidence into one transport-independent runtime protocol.
