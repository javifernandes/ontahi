# 145. Ordered Relations And Sequence Commands

Status: next

Canonical ID: `ontahi://plans/145-ordered-relations-and-sequence-commands`

Depends on:

1. [131. Ontahi Relationship Semantics](../done/131-ontahi-relationship-semantics.md)
2. [128. Ontahi Data Graph Execution Bridge](../current/128-ontahi-data-graph-execution-bridge.md)
3. [135. Applied Mutation Outcomes And Reactions](../done/135-applied-mutation-outcomes-and-reactions.md)
4. [137. Reflected Relation Affordances](../done/137-reflected-relation-affordances.md)

Related future work:

1. [132. Durable Invocation Identity And Idempotency](./132-durable-invocation-identity-and-idempotency.md)

## Summary

Make ordered membership a first-class semantic form of to-many Relation. Preserve the intent to
insert, move, remove, or atomically transfer one identified member without replacing or transporting
the complete collection.

The first executable proof is `TodoList.items`: users can reorder one TodoItem inside a list or move
it into another list at a precise position. The same model should serve local execution, remote
Commands, optimistic UI, exact deltas, undo, audit, and eventual replicated ChangeSets.

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

## Proposed Form

The exact declaration syntax is a design target, not an accepted API:

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

1. In-memory execution maintains ordered membership facts and proves deterministic insert, reorder,
   transfer, remove, rollback, and delta behavior.
2. PostgreSQL may use a provider-private sortable key on the child row or association table.
   Fractional/lexicographic ranks can keep ordinary moves to one small update; occasional rebalance
   remains an internal storage concern.
3. A transfer across sources updates parent membership and destination position in one transaction.
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
  structuralVerbs: ['insert', 'move', 'transfer'],
}
```

Runtime affordances decide whether the current actor may execute a particular move. Explorer and
headless UI can then offer sortable related-instance views, cross-view transfer, optimistic
movement, and rollback from the same reflected contract.

The React layer should optimistically apply the semantic move, correlate it with the Applied
Outcome, suppress duplicate delivery, and restore/rebase on a structured conflict. It should not
invalidate and download an entire collection when the exact ordered delta is available.

## Scope

1. Define ordered Relation metadata and its constraints on supported cardinalities.
2. Define same-source reorder and cross-source transfer as portable structural Commands.
3. Define exact ordered deltas and inverse movement evidence.
4. Implement in-memory execution and atomic rollback.
5. Extend remote protocol, default-deny policy, and runtime routing.
6. Implement one PostgreSQL mapping without exposing its position token publicly.
7. Reflect ordered verbs and authority-aware affordances.
8. Replace Todo's local-storage item ordering with the ordered Relation proof, including moving a
   TodoItem between lists.
9. Record the boundary to future ChangeSet replication, optimistic rebase, and undo.

## Non-Goals

1. Do not model arbitrary JSON arrays or scalar Value arrays as Relations.
2. Do not send the complete ordered collection for insert, move, or remove.
3. Do not use raw numeric indices as the durable remote contract.
4. Do not make structural remove imply Entity deletion.
5. Do not make every ordering preference domain state; purely personal UI layout may remain local.
6. Do not implement a general CRDT, offline-first database, or complete ChangeSet log in the first
   execution slice.
7. Do not hide domain invariants, effects, or lifecycle inside Relation metadata; use Domain
   Operations when movement has application-specific meaning beyond structural membership.

## Execution Slices

1. **Semantic core**: choose declaration and authoring vocabulary; define canonical command,
   ordered delta, preconditions, diagnostics, and query ordering behavior.
2. **In-memory proof**: implement insert/reorder/transfer/remove, exact deltas, rollback, and
   deterministic conformance tests.
3. **Remote boundary**: version the command envelope, add default-deny ordered actions, validate
   Refs/anchors, and preserve outcome correlation.
4. **PostgreSQL proof**: implement provider-private position storage, transactionally atomic
   cross-list transfer, and rebalance behavior.
5. **React and Todo proof**: replace local arrays with optimistic ordered Commands; support natural
   drag within and between lists, conflict feedback, reload persistence, and exact reconciliation.
6. **Reflection proof**: expose ordered relation metadata and consume it in one generic Explorer or
   headless affordance.
7. **Distribution follow-up**: extract a focused plan for durable ChangeSets, undo/revert,
   multi-client rebase, and any replicated-sequence algorithm justified by evidence.

## Acceptance Checklist

- [ ] Ordered membership is declared as Relation semantics, not an application array convention.
- [ ] Same-list reorder transports one member plus stable relative anchors.
- [ ] Moving a member between lists is one atomic transfer command.
- [ ] Required inverse membership does not expose an invalid standalone remove affordance.
- [ ] Entity deletion remains distinct from ordered Relation removal.
- [ ] Applied outcomes include exact previous and next source/anchor evidence.
- [ ] An applied move can produce a semantic inverse without reading a historical snapshot.
- [ ] In-memory and PostgreSQL runtimes pass the same ordered-command conformance suite.
- [ ] Failed transfers roll back both membership and position.
- [ ] Remote policy defaults to deny and validates source, member, destination, and anchors.
- [ ] Repeated command identity is idempotent when Plan 132 evidence is available.
- [ ] Query traversal has a documented default-order contract and explicit-sort precedence.
- [ ] Reflection exposes ordered topology separately from runtime authority.
- [ ] Todo proves optimistic intra-list reorder and inter-list transfer without sending full arrays.
- [ ] Concurrent stale-anchor and same-member moves return structured, test-covered outcomes.
- [ ] Full collection snapshots remain available for reads and recovery, not ordinary movement.
- [ ] Distribution/ChangeSet work that remains after the authoritative proof is captured in a linked
      follow-up rather than silently absorbed.

## Verification

1. Core type tests for legal ordered cardinalities and invalid declaration combinations.
2. Portable serialization round trips for insert, reorder, end placement, and cross-source transfer.
3. Shared in-memory/PostgreSQL conformance tests for before/after anchors and exact deltas.
4. Transaction tests proving no partial unlink, reparent, or rank update on failure.
5. Remote policy tests for denied action, inaccessible member, foreign destination, and stale anchor.
6. Idempotent retry tests once durable command identity is available.
7. React tests proving optimistic preview, applied confirmation, rollback, and out-of-order outcome
   handling.
8. Browser proof moving one TodoItem upward, downward, to the end, and into another TodoList, then
   reloading from authoritative storage.

## Open Questions

1. Is `ordered: true` sufficient declaration, or must the relation name an explicit ordering policy?
2. Should the public verbs be `insert/move/remove`, `add/reposition/remove`, or a focused sequence
   facade over canonical `link/unlink/move` actions?
3. Is an ordered delta an extension of Relationship Delta or a distinct Sequence Delta embedded in
   Applied Outcome?
4. Which revision belongs to a move: the source collection, destination collection, parent Entity,
   or one runtime-specific aggregate token?
5. What is the portable response when an anchor disappears but the member and destination remain?
6. Should a cross-list transfer authored from the inverse endpoint normalize to assignment of the
   owning Reference Field plus ordered evidence, or remain one dedicated canonical command?
7. How should bulk Selection-valued movement behave without losing deterministic relative order?
8. When does a provider-private ranking token need rebalance, and how is rebalance kept invisible to
   audit, Reactions, and optimistic clients?
9. What exact evidence from the earlier Beanie ChangeSet design should become a separate durable
   replication plan after the authoritative ordered Relation proof?
