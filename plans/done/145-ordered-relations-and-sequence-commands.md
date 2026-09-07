# 145. Ordered Relations And Sequence Commands

Status: done

Canonical ID: `ontahi://plans/145-ordered-relations-and-sequence-commands`

Depends on:

1. [131. Ontahi Relationship Semantics](../done/131-ontahi-relationship-semantics.md)
2. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
3. [135. Applied Mutation Outcomes And Reactions](../done/135-applied-mutation-outcomes-and-reactions.md)
4. [137. Reflected Relation Affordances](../done/137-reflected-relation-affordances.md)

Related future work:

1. [132. Durable Invocation Identity And Idempotency](../next/132-durable-invocation-identity-and-idempotency.md)

## Summary

Make ordered membership a first-class semantic form of to-many Relation. Preserve the intent to
move one identified member without replacing or transporting the complete collection.

The first executable proof is `TodoList.items`: users can reorder one TodoItem inside a list at a
precise position. The same model serves local execution, remote Commands, optimistic UI, exact
deltas, audit, and future undo or replicated ChangeSets without claiming those later capabilities
in this slice.

This plan extends the established narrow Relation lifecycle:

```text
Sequence Relationship Command
  -> exact ordered Relationship Delta
  -> Applied Outcome
```

It does not turn Relation into an arbitrary array container or introduce a complete CRDT system in
the first slice.

## Context And Evidence

The Todo dashboard currently keeps an `itemOrderByList` array in browser local storage. Dragging an
item computes a new complete local array even though the user intent is much smaller:

```text
move Todo A after Todo B
```

That implementation is acceptable as a UI prototype but has no shared domain meaning, cannot move
an item between lists, and cannot synchronize efficiently across clients.

Existing Ontahi Relationship Commands already preserve structural intent for `assign`, `clear`,
`add`, and `remove`. They cross the remote graph protocol as versioned JSON-safe values, execute
under default-deny policy, and return exact Relationship Deltas. Ordered membership is therefore a
focused extension of an existing semantic boundary rather than an application-authored CRUD
Operation.

Earlier distributed-state work around Beanie identified the same pressure in ChangeSets: sending a
new collection snapshot erases whether the user inserted, removed, or moved one element, makes undo
expensive, and produces avoidable conflicts. Fine-grained Commands retain intent and minimize the
transport side effect.

## Semantic Boundary

An ordered Relation is still graph topology. Ordering adds structural position to membership; it
does not automatically give the edge independent identity, arbitrary attributes, or lifecycle.

Use an Association Entity when position itself participates in richer domain state, policy,
history, timestamps, or other Relations. A provider-owned ranking token used only to materialize an
ordered Relation remains storage evidence and is not an Entity Field exposed by default.

The Todo proof sharpens three distinct actions:

1. **Reorder**: the TodoItem remains in the same TodoList and only its ordered position changes.
2. **Transfer/reparent**: the TodoItem moves atomically from one TodoList to another and receives a
   position in the destination.
3. **Delete**: the TodoItem Entity ceases to exist. This remains Entity lifecycle, not ordered
   Relation removal.

For an inverse Relation backed by required `TodoItem.list`, plain unlinking is invalid because it
would leave the TodoItem without a required parent. Reflected structural verbs must derive from
cardinality and nullability: reorder and transfer may be available while remove is not.

## Explored Form

Before the first-slice decision, the design space included an inverse-field facade and cross-source
transfer:

```ts
relations: () => ({
  items: relation.inverse(TodoItem.fields.list, { ordered: true }),
});
```

Bound authoring should use stable Refs and relative anchors:

```ts
yield * inbox.items.move(todo).after(previousTodo).run();
yield * inbox.items.move(todo).before(nextTodo).run();

yield * inbox.items.move(todo).to(later, { after: laterTodo }).run();
```

Equivalent lower-level forms may be preferable if they keep the canonical command smaller. The
important contract is that authoring normalizes to one portable command and one canonical Relation
identity.

UI indices are transient input only. Before transport, a drop at index `n` becomes a stable
`before` or `after` Entity Ref. Raw indices are not the durable wire contract because concurrent
insertions make them stale immediately.

## First Vertical Slice Decision

The Todo proof uses an ordered inverse `hasMany` over a required Reference Field:

```ts
relations: () => ({
  items: relation.hasMany(entity.ref('TodoItem'), {
    via: 'list',
    ordered: true,
  }),
});
```

`ordered: true` means that membership has one authoritative natural sequence. It is legal only on a
direct `hasMany` whose target Field is a required Reference Field back to the declaring Entity. It
does not add an Entity Field and does not expose the provider's rank. A nullable inverse or a
many-to-many edge needs a later slice that also settles insert/remove semantics.

The portable command is a separate semantic Graph Command variant because a same-list reorder does
not add or remove a relationship fact:

```ts
type OrderedRelationshipCommand = {
  kind: 'ordered-relationship-command';
  action: 'move';
  relation: {
    sourceEntityName: string;
    relationName: string;
    targetEntityName: string;
    cardinality: 'ordered-many';
  };
  source: EntityRef;
  member: EntityRef;
  position: { at: 'start' | 'end' } | { before: EntityRef } | { after: EntityRef };
  precondition?: {
    position: { before: EntityRef | null; after: EntityRef | null };
    onMismatch?: 'fail' | 'skip';
  };
};
```

The public authoring surface is `relationship(List, 'items', list).move(member, position)`, with
`prepend`, `append`, `before`, and `after` as convenience forms that normalize to the same command.
All forms move an existing member; they do not silently create membership. The first slice rejects
a missing source, member, anchor, or member/anchor outside the named relationship with stable
structured diagnostics. Moving to the already-resolved position is `applied` with an empty ordered
delta. An optional exact-neighborhood precondition detects a concurrent change; mismatch fails by
default or returns `not-applied` only when the caller explicitly chooses `skip`.

Applied results extend the existing Relationship Delta with resolved movement evidence:

```ts
type OrderedRelationshipDelta = RelationshipDelta & {
  moved: Array<{
    relation: CanonicalOrderedRelationIdentity;
    source: EntityRef;
    member: EntityRef;
    from: { before: EntityRef | null; after: EntityRef | null };
    to: { before: EntityRef | null; after: EntityRef | null };
  }>;
};
```

In-memory storage materializes the order in the stable target-row sequence. PostgreSQL uses a
provider-private integer position column recorded by Relation mapping metadata. The first adapter
slice rewrites a dense `1..n` sequence inside one transaction. PostgreSQL locks the source row
before reading siblings, which serializes competing moves and gives the subsequent read a fresh
`READ COMMITTED` snapshot. This intentionally favors a small, auditable correctness proof over a
fractional-rank implementation; sparse/lexicographic ranks can replace the physical strategy later
without changing declarations, Commands, deltas, or reads.

Natural Relation order applies only when traversing the ordered Relation and no explicit sort was
authored. An explicit Query `orderBy` wins completely. Root Entity Queries keep their existing
semantics and do not acquire an implicit order from an unrelated inverse Relation.

Cross-source transfer is deliberately split from this first Todo acceptance path. A member that is
not in `source.items` is rejected instead of being silently reparented. Transfer must later define
source/destination policy, ordered evidence on both sides, and generic insert/remove behavior for
nullable and many-to-many ordered Relations; it must not be smuggled into same-source `move`.

## Portable Command Shape

One provisional envelope is:

```ts
type SequenceRelationshipCommand = {
  kind: 'relationship-command';
  action: 'insert' | 'move' | 'remove';
  relation: CanonicalRelationIdentity;
  member: EntityRef;
  from?: EntityRef;
  to: EntityRef;
  position: { before?: EntityRef; after?: EntityRef };
  precondition?: {
    baseRevision?: string;
    expectedBefore?: EntityRef;
    expectedAfter?: EntityRef;
  };
  commandId?: string;
};
```

The final protocol should avoid redundant states such as setting both `before` and `after`. A move
inside one source may omit `from`; a cross-source move must still resolve and validate the current
membership authoritatively instead of trusting the caller's source claim.

## Ordered Delta And Reversibility

The current `{ added, removed }` Relationship Delta cannot describe a same-list reorder because the
membership fact does not change. Ordered execution needs exact movement evidence:

```ts
type OrderedRelationshipMove = {
  member: EntityRef;
  from: {
    source: EntityRef;
    before?: EntityRef;
    after?: EntityRef;
  };
  to: {
    source: EntityRef;
    before?: EntityRef;
    after?: EntityRef;
  };
};

type OrderedRelationshipDelta = RelationshipDelta & {
  moved: readonly OrderedRelationshipMove[];
};
```

The applied delta records resolved previous and next anchors, not provider ranking tokens. It is
sufficient for cache reconciliation, telemetry, audit, and creation of an inverse move for undo.
Cross-list movement may also change the canonical relationship fact; the result contract must avoid
double-counting one transfer as unrelated unlink and link events.

## Execution And Storage

The runtime owns translation from semantic anchors to physical position:

1. In-memory execution maintains target-row sequence and proves deterministic same-source reorder,
   no-op, precondition, rejection, and delta behavior.
2. PostgreSQL may use a provider-private sortable key on the child row or association table.
   Fractional/lexicographic ranks can keep ordinary moves to one small update; occasional rebalance
   remains an internal storage concern.
3. Cross-source transfer remains a follow-up requiring a distinct atomic contract.
4. Remote execution sends one bounded command rather than a complete ordered collection.
5. Query traversal uses relation order by default. The interaction between semantic order and an
   explicitly authored Query `orderBy` must be unambiguous.

## Concurrency And Distribution

The first implementation should be server-authoritative and transactionally serialized. It should
not claim CRDT semantics before conflict behavior is explicit.

The protocol should nevertheless preserve the evidence needed for later distribution:

1. stable command identity and idempotency through Plan 132;
2. a collection or aggregate revision when the runtime can guarantee it;
3. relative member anchors instead of numeric indices;
4. structured `not-applied` diagnostics for stale/missing member, missing anchor, changed parent,
   constraint rejection, or revision mismatch;
5. exact previous/next anchors in the applied delta for inverse operations and rebase.

Independent moves in different ordered Relations should merge naturally. Concurrent moves of the
same member or moves whose anchor disappeared need an explicit policy: reject and refresh, rebase to
the surviving neighborhood, or use a future replicated-sequence algorithm. That decision belongs
after the authoritative command semantics are proven.

## Reflection And UI Affordances

Reflection should expose ordered topology without claiming authority:

```ts
{
  ordered: true,
  structuralVerbs: ['move'],
}
```

Runtime affordances decide whether the current actor may execute a particular move. Explorer and
headless UI can then identify sortable related-instance views without inventing unsupported
membership actions.

The React proof applies one ephemeral optimistic move, awaits the Graph Command result, and refetches
the authoritative ordered Relation on success or failure. Exact-delta cache reconciliation and
multi-client rebase remain optimizations after the semantic transport is established.

## Delivered Scope

1. `ordered: true` on a direct `hasMany` backed by a required target Reference Field.
2. Same-source `move`, `append`, `prepend`, `before`, and `after` authoring normalized to one
   portable structural Command.
3. Exact ordered movement deltas, stable typed rejections, no-op semantics, and exact-neighborhood
   preconditions.
4. In-memory and transactionally serialized PostgreSQL execution.
5. Version-2 Graph Command transport through Fetch and WebSocket with default-deny `move` policy.
6. Natural Relation traversal ordering with explicit `orderBy` precedence.
7. Reflection, generated client schema, React execution hook, Devtools Activity semantics, and
   Explorer-safe affordances.
8. Todo migration from browser-owned item arrays to authoritative nested `TodoList.items`, while
   keeping list-card layout and list ordering as explicit presentation state.

## Non-Goals And Follow-Ups

1. Cross-source transfer/reparenting, ordered nullable membership, ordered many-to-many edges, and
   generic structural insert/remove are not part of this slice.
2. Durable command identity and retry deduplication remain with Plan 132. Repeating an already
   satisfied move is nevertheless an applied no-op with an empty delta.
3. Sparse or lexicographic ranking, incremental rebalance, CRDT/offline replication, ChangeSets,
   inverse-command generation, and exact-delta cache patching remain replaceable follow-ups.
4. Numeric UI indices and provider ranking tokens remain outside the portable protocol.
5. Entity deletion remains separate from Relation movement, and personal visual layout remains
   local presentation state.

## Acceptance Checklist

- [x] Ordered membership is declared as Relation semantics, not an application array convention.
- [x] Same-list reorder transports one member plus a stable relative anchor or boundary.
- [x] Ordered required inverse membership exposes movement, not generic membership mutation.
- [x] Applied outcomes include exact previous and next neighbor evidence.
- [x] In-memory and PostgreSQL prove all placement forms, no-op, missing/wrong membership, and stale
      preconditions.
- [x] PostgreSQL executes under a source lock and leaves other Relations unchanged.
- [x] Remote policy defaults to deny and validates source, member, anchor, and neighbors.
- [x] Query traversal has a documented natural-order contract and explicit-sort precedence.
- [x] Reflection exposes ordered topology and only the supported structural verb.
- [x] Fetch and WebSocket preserve the versioned command and typed result.
- [x] Todo proves optimistic drag and keyboard reorder without transporting full arrays or persisting
      item order in `localStorage`.
- [x] Reload reads the authoritative order, and Devtools renders the natural `graph.command`
      Activity with Visual, Body, and Envelope views.

## Verification Record

1. Core declaration, type surface, reflection, protocol, dispatcher, placement, diagnostics,
   precondition, no-op, and delta tests.
2. PostgreSQL schema-contract, natural/explicit order, transaction, rejection, and concurrent stale
   move integration tests.
3. React hook and Fetch executor tests plus Todo Fetch and WebSocket integration tests.
4. Todo query, drag, keyboard, pending/error, and local-storage regression tests.
5. Devtools summary and semantic-detail component tests.
6. Full repository typecheck, lint, package/example builds and tests, coverage, clean-room artifact
   verification, changeset validation, and manual browser QA for WebSocket and HTTP transports.
