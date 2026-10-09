# 154d. Semantic Mutation Journal And Query Invalidation

Status: current

Canonical ID: `ontahi://plans/154d-semantic-mutation-journal-and-query-invalidation`

Related plans:

1. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)
2. [128h. Observable Query Runtime And Durable Progress](../done/128h-observable-query-runtime-and-durable-progress.md)
3. [148. Ontahí DevTools Runtime Inspection](../current/148-ontahi-devtools-runtime-inspection.md)
4. [150. Ontahí DevTools Semantic Console](../current/150-ontahi-devtools-semantic-console.md)
5. [Operation Output Cache Semantics](../backlog/operation-output-cache-semantics.md)

## Summary

Replace application-authored cache-key invalidation with a bounded semantic mutation journal. A
successful Unit of Work records the canonical Graph Commands that were actually applied and
publishes them only after commit. A Graph Read retains its canonical request as its dependency
description. A conservative matcher invalidates a cached Read unless it can prove that the Read and
the committed mutation are disjoint.

Bulk work must remain intensional. An Operation that updates ten million rows records one command
whose target is a Selection; it must not manufacture a ten-million-row changelog. Exact deltas may
be retained as bounded evidence when already available, but correctness must not depend on them.

Operations that execute native SQL, call an external system, or otherwise bypass Graph Command
execution need an explicit semantic escape hatch. The escape hatch declares the equivalent Graph
Command or, when exact mutation semantics are unavailable, a conservative affected Selection. It
must never ask the application to name React Query keys or enumerate client caches.

## Why This Plan Exists

The Todo model-command proof can invoke `TodoList.completeAll` successfully, but the initiating
client can continue showing stale items. The current repair path in `@ontahi/react` is deliberately
coarse:

1. a direct Graph Command invalidates every React Query root for each participating Entity name;
2. an Operation uses application-authored `bridge.invalidate` query-key prefixes;
3. the server does not return the mutations applied inside an Operation;
4. the client therefore cannot distinguish `completeAll(Later)` from an unrelated mutation of
   `Inbox`.

The repository already contains stronger semantic material:

1. `EntityMutationCommand` update and delete targets may be either an Entity Ref or a
   `SelectionAst`;
2. relationship mutations have canonical commands;
3. `AppliedMutationOutcome` already pairs an applied command with a delta and causal identity for
   Mutation Reactions;
4. `withDataGraphTransaction` runs work in a child Unit of Work and defers post-commit work until
   the storage transaction succeeds;
5. `TodoList.completeAll` already executes one Selection-targeted update, but currently requests
   every updated ID only to calculate a count;
6. Graph Reads and the client query layer already retain canonical requests at execution time.

This plan connects those pieces. It does not introduce a second selection language or a cache
metadata taxonomy.

## Semantic Model

### Mutation as an existing program

The primary mutation description is the canonical command that ran:

```text
TodoItem
  where list = Later
  and completed = false
  update completed = true
```

Its durable meaning is:

```text
target Selection + mutation operator
```

Create, update, delete, attach, detach, and ordered-relation changes remain their existing command
families. The journal does not translate them into ad hoc `{ entity, partition, fields }` objects.

### Proposed terms

Names are provisional until the first slice proves the boundary:

```ts
type CommittedMutation = {
  effect:
    | { kind: 'graph-command'; request: GraphCommandRequest }
    | { kind: 'selection-change'; selection: SelectionAst }
    | { kind: 'graph-change' };
  provenance: 'captured' | 'declared' | 'conservative';
  evidence?: BoundedMutationEvidence;
};

type CommittedMutationSet = {
  mutations: readonly CommittedMutation[];
  precision: 'exact' | 'intensional' | 'widened';
};
```

The command is authoritative semantic intent. Evidence may contain a small exact delta, affected
Refs already produced by execution, counts, or causal identifiers. Evidence is optional and
bounded; it must never change which mutations are considered possible.

A conservative escape hatch uses a first-class `changed(Selection)` mutation effect when no honest
create/update/delete/relationship operator can be declared. Native work may report this
non-executable effect directly; it must not manufacture a no-op/touch Graph Command that lies about
what executed.

### Read dependency

The initial dependency description is the canonical `GraphReadRequest` already owned by a cached
read. Dependency extraction may expose its root Selection, nested relationship selections,
projected fields, ordering fields, cardinality, and aggregates, but these facts must be derived from
the Read rather than copied into application configuration.

### Conservative matching

The core question is:

```ts
mayAffect(mutation: CommittedMutation, read: GraphReadRequest): boolean;
```

The correctness rule is asymmetric:

```text
provably disjoint  -> false
same or uncertain -> true
```

The first matcher should understand only facts it can prove cheaply:

1. different Entity roots are disjoint unless a traversed relation makes the mutated Entity a Read
   dependency;
2. the same concrete Entity Ref may overlap;
3. distinct concrete identity equality constraints may be disjoint;
4. an unfiltered Entity root may overlap every mutation of that Entity;
5. structurally equal Selections may overlap;
6. incompatible equality predicates over the same Field may be disjoint;
7. an update that touches no projected, filtered, ordered, grouped, joined, or derived dependency
   may be irrelevant only when that independence can be proved;
8. unsupported predicates, transforms, derived Fields, or relation paths return `true`.

This is not a general SAT solver, database optimizer, or complete query-containment algebra. Later
slices may prove more disjointness without changing the journal or protocol.

## Transaction And Unit-Of-Work Semantics

The journal belongs to the Unit of Work that owns the effects, not to a global process singleton.

Required lifecycle:

```text
Operation / Graph Command dispatch
  -> open or reuse Unit of Work journal
  -> execute command
  -> record only an applied mutation
  -> commit storage transaction
  -> seal journal
  -> publish committed MutationSet
```

The following invariants are mandatory:

1. rejected, failed, interrupted, or rolled-back commands publish no committed mutation;
2. post-commit publication cannot make a rolled-back effect visible;
3. a child Unit of Work created for a transaction contributes only after its transaction commits;
4. nested work preserves causal order without publishing the same command twice;
5. Mutation Reactions and journal capture share applied outcomes where possible rather than wrapping
   execution independently;
6. recording is scoped to one invocation or Task step and cannot leak into concurrent work;
7. the domain Operation result remains unchanged; mutation metadata travels in runtime execution
   metadata or its protocol envelope, not inside the business output schema.

External effects that cannot participate in the Data Graph transaction remain explicitly weaker.
The plan must label their commit/compensation semantics rather than pretending they rolled back.

## Scale And Boundedness

The journal must have a configured entry and byte budget. Its behavior at the limit is semantic,
not merely operational:

1. retain a Selection-targeted bulk command as one entry regardless of matched row count;
2. merge identical commands or compatible evidence only when doing so cannot hide a possible
   effect;
3. keep exact Refs or row facts only below a small explicit bound;
4. when many narrow commands exceed the budget, widen to a conservative Selection or Entity root;
5. mark widened output so Devtools can explain the loss of precision;
6. never truncate entries silently;
7. never require the authority runtime to know which clients or caches currently care;
8. never send cached Read descriptions with every mutation invocation.

The initiating client may match a returned MutationSet against its local cached Reads. Server-side
observation may match the same MutationSet against Reads registered once for an active observation.
Cross-client distribution is a later delivery concern and must not change the semantic payload.

## Authority And Information Boundaries

A canonical command may contain identities, predicates, or values that are sensitive. Therefore:

1. authorization to invoke a mutation does not authorize disclosure of its mutation metadata;
2. the first proof separately authorizes the metadata contents for the initiating caller and returns
   only an authority-scoped projection, or withholds metadata that cannot be disclosed safely;
3. publication to observation subscribers must use each subscription's authority and scope;
4. a future shared invalidation bus may use opaque scoped revision identities if the full command
   would disclose information;
5. the runtime must not send exact evidence that would let a client infer inaccessible Entity
   identities;
6. matching affects refresh decisions only and never grants read or mutation authority;
7. every refreshed Read executes its ordinary receiver-owned authorization again.

## Scope

This plan includes:

1. a bounded Unit-of-Work mutation journal;
2. automatic capture of applied Entity and relationship Graph Commands;
3. an explicit semantic declaration API for native bulk work;
4. commit/rollback and nested-Unit-of-Work behavior;
5. a small conservative matcher over canonical Graph Commands and Graph Reads;
6. runtime protocol metadata for committed mutation sets;
7. React Query invalidation by inspecting cached canonical Reads rather than application query-key
   declarations;
8. one Todo end-to-end proof centered on `TodoList.completeAll`;
9. Devtools visibility into captured, declared, conservative, and widened mutations;
10. compatibility with existing `bridge.invalidate` and explicit query-key invalidation while the
    semantic path proves itself.

## Non-Goals

This plan does not include:

1. complete logical intersection or containment for arbitrary Selections;
2. eagerly enumerating every affected Entity;
3. sending client cache inventories with an invocation;
4. a distributed invalidation broker, cross-region delivery, or offline replay;
5. guaranteeing that exact deltas are available;
6. replacing Graph Reads, Graph Commands, Operation outputs, or Mutation Reactions;
7. using cache keys as semantic mutation identity;
8. optimistic client updates or automatic local execution of mutation operators;
9. making external side effects transactionally atomic with the Data Graph;
10. removing compatibility invalidation metadata before the new path has end-to-end evidence.

## Execution Slices

### Slice 1: Pure semantic matching proof

Define the smallest internal committed-mutation representation around canonical Graph Commands and
implement a pure `mayAffect` matcher. Prove same Selection, broad root, concrete identity mismatch,
simple incompatible equality, changed predicate/projection Fields, create/delete, and unknown
fallback behavior. Keep it independent of React and transport.

Exit condition: the matcher has no cache-key inputs and never returns `false` without a proof of
disjointness.

### Slice 2: Transaction-scoped capture

Add a bounded journal resource to Unit of Work and capture successful Entity and relationship
command outcomes at the common applied-mutation boundary. Integrate with the existing Data Graph
post-commit queue and Mutation Reaction causality. Prove commit, rollback, failure, interruption,
nested transaction, reaction follow-up, and concurrent invocation isolation.

Exit condition: one successful transaction publishes one sealed MutationSet; every unsuccessful
transaction publishes none.

### Slice 3: Explicit declaration and bounded widening

Expose a server-side API for Operations whose native implementation bypasses the Graph Command
runtime. Prefer declaration of an equivalent canonical command. Resolve the conservative
`changed(Selection)` question and define deterministic budget, merge, and widening rules.

Exit condition: a simulated million-row bulk update produces constant-size semantic output, while
an over-budget loop widens safely instead of truncating.

### Slice 4: Runtime protocol projection

Project committed mutations as execution metadata for direct Graph Commands, Operation
Invocations, and completed durable Operations without modifying domain result schemas. Preserve
backward compatibility for receivers that do not advertise or return mutation metadata. Decide the
minimum protocol capability/version boundary from the local proof rather than versioning in
advance.

Exit condition: the initiating caller can receive a portable bounded MutationSet only after the
effect is committed.

### Slice 5: React cache matching

Associate each React Query cache entry produced by Ontahí with its canonical Graph Read. On a
successful mutation, evaluate `mayAffect` against current local entries and invalidate only possible
overlaps. Keep existing manual invalidation options as compatibility and explicit host overrides.

Exit condition: invalidation uses canonical Reads and mutations; no application query-key prefix is
required for the proof path.

### Slice 6: Todo end-to-end proof

Remove `bridge.invalidate` from `TodoList.completeAll` only after the semantic path passes. Ensure
the Operation executes one Selection update without returning every ID merely for invalidation.
Demonstrate:

1. `completeAll(Later)` refreshes the matching Later list;
2. it refreshes a broad `TodoItem` read;
3. it does not refresh Inbox when disjointness is provable;
4. rollback produces no refresh;
5. an unsupported Read shape refreshes conservatively;
6. direct UI, model-triggered invocation, and durable completion behave identically.

Exit condition: the stale Todo UI reproduction is fixed without Todo-specific refresh callbacks or
cache keys.

### Slice 7: Relationships, observation, and inspection

Extend proven matching to create/delete and relationship membership/order changes. Feed the same
committed MutationSet into active Graph Read observations without changing their authored Query.
Show causal journal entries and precision/widening decisions in Devtools Activity.

Exit condition: local cached reads and active server observations consume one semantic mutation
contract, while Event occurrence, mutation effects, and reactive revisions remain distinct.

## Verification Strategy

1. Type and protocol tests for every mutation entry and provenance variant.
2. Property-style matcher tests asserting that unknown structures never prove disjointness.
3. Selection tests for equality, identity, conjunction, disjunction, and unsupported operators.
4. Mutation-field tests covering projected, filtered, ordered, grouped, derived, and unused Fields.
5. Unit-of-Work tests for commit, rollback, nested work, post-commit failure, interruption, and
   concurrency isolation.
6. Budget tests proving journal size is bounded and widening is monotonic in conservatism.
7. Reaction tests proving one applied outcome is not double-counted.
8. Runtime Protocol round-trip and backward-compatibility tests.
9. React tests with several cached Reads, including demonstrably disjoint and uncertain entries.
10. Todo browser/runtime integration tests for direct, model, and durable Operation execution.
11. Authority tests proving mutation metadata and subsequent refreshes do not widen access,
    including an invocation that is allowed while its command target falls outside the caller's
    Graph Read scope and therefore must be projected safely or withheld.
12. Devtools tests explaining command, provenance, transaction outcome, and precision.

## Acceptance Checklist

- [ ] The journal stores semantic mutation programs, not an exhaustive row changelog.
- [ ] A Selection-targeted bulk command occupies constant space regardless of affected row count.
- [ ] Applied Entity and relationship commands are captured automatically.
- [ ] Failed, rejected, interrupted, and rolled-back work publishes no committed mutation.
- [ ] Nested and concurrent Units of Work remain causally and spatially isolated.
- [ ] Native work can declare an equivalent command or conservative Selection without cache keys.
- [ ] Journal overflow widens conservatively and never truncates silently.
- [ ] Exact deltas are optional bounded evidence, not a correctness requirement.
- [ ] Cached Reads retain canonical dependency descriptions without being sent on every invocation.
- [ ] The matcher returns false only for provable disjointness.
- [ ] Unsupported Selection or mutation forms invalidate conservatively.
- [ ] Mutation metadata does not modify an Operation's domain output schema.
- [ ] Runtime Protocol transport is bounded and backward compatible.
- [ ] React invalidation does not require application-authored query-key prefixes for the proof.
- [ ] `completeAll(Later)` refreshes affected Reads and skips a provably disjoint Inbox Read.
- [ ] A refreshed Read is authorized normally and receives no authority from the MutationSet.
- [ ] Devtools distinguishes captured, declared, conservative, and widened mutations.
- [ ] Existing manual invalidation remains available until migration evidence supports removal.

## Decisions Recorded

1. Canonical Graph Commands and Selections are the semantic basis; cache-domain JSON is rejected.
2. Mutation recording belongs to Unit of Work and becomes visible only after commit.
3. Bulk effects are intensional and constant-size by default.
4. Exact deltas are evidence, not the mutation identity.
5. Mutation producers do not receive client cache inventories.
6. Matching is conservative and intentionally incomplete.
7. Application escape hatches describe domain mutations, never cache implementation details.
8. Operation business outputs remain independent from runtime mutation metadata.
9. Existing bridges and explicit invalidation options are compatibility paths, not the target model.
10. Native work may report a first-class, non-executable `selection-change`; it must not manufacture
    a Graph Command whose operator or values did not actually run.
11. Journals default to 64 entries and 64 KiB of encoded mutation entries. Equal effects deduplicate
    while retaining the strongest provenance (`captured` over `declared` over `conservative`).
12. Overflow widens deterministically to sorted affected Entity-root Selections, then to a global
    graph change when those roots still exceed the budget. Widening is monotonic and never silently
    drops a possible affected Entity.

## Open Questions

1. Should the journal retain `AppliedMutationOutcome`, a portable projection of it, or only its
   canonical command plus selected causal metadata?
2. What is the common capture point shared by direct dispatch, Operations, Tasks, and Mutation
   Reactions without double recording?
3. How should create matching evaluate generated/defaulted Fields that were absent from authored
   values?
4. Which Read dependencies must be extracted for nested relations, aggregates, derived Fields, and
   contextual selections?
5. What exact-evidence limit should be the safe default once evidence is retained?
6. Should post-commit publication failure fail the caller, become telemetry, or create retryable
   delivery work after the storage commit can no longer roll back?
7. Which protocol family owns mutation metadata for direct Graph Commands versus Operations and
   durable Task completion?
8. Can server observation consume full commands safely, or does cross-authority delivery require
   opaque scoped revision tokens?
9. When may a client reconcile exact bounded evidence locally instead of refetching?
10. What evidence is required before removing `bridge.invalidate` and explicit query-key options?

## Closure And Evolution

This plan implements candidate slice `154d` from Plan 154. Completion should update the Semantic
Program Kernel Atlas item with the proven relationship among Effect, Unit of Work, committed
mutation, dependency, and Reactive revision. If matching grows beyond cheap conservative proofs,
extract a separate Selection-intersection plan rather than expanding this plan into a general query
optimizer. Distributed delivery, offline clients, and cross-runtime invalidation should likewise be
follow-up plans built on the committed semantic payload.
