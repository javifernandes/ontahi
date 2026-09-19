# Operation output semantics and client cache

Status: backlog

## Context and agreed direction

Follow-up agreed while building the Devtools Cache inspector (PR #155). `useOperation` already
reconciles entities when the operation supplies `graphOutput`; the unresolved issue is whether a
returned entity represents current state or a historical snapshot. Arrival order is not freshness.

Declare this distinction on the output, including nested parts, rather than on the operation as a
whole. By default returned entities represent current state and participate in canonical cache
reconciliation. An explicit historical/previous-state output preserves the returned snapshot,
without overwriting the canonical entity or later denormalizing it into the current state.

Illustrative intent, not decided API syntax: an operation returns `{ before: historical(Entity),
after: Entity }`. Historical identity may remain navigable without aliasing the historical value to
the live canonical record. Decide how entity refs nested inside historical results behave.

## Scope

- Choose the smallest output declaration for previous-state snapshots, with room for future
  alternative representations only if a concrete use case requires it.
- Carry the declaration through reflection, codegen, normalization and React result handling.
- Test current/default behavior and mixed before/after results with the same identity.
- Preserve a historical result after subsequent writes to the current entity.

Persistent entity versioning, audit logs, revision storage, retention, and automatic version ordering
are separate concerns. Do not add those requirements to this work. Storage/write amplification,
retention and indexing would need explicit scale/cost evaluation for a future versioning capability.

## Acceptance

- [ ] Decide declaration syntax and per-output-node semantics.
- [ ] Implement runtime and generated-client propagation.
- [ ] Verify historical outputs never mutate or read through the canonical current value.
- [ ] Document defaults and examples without introducing persistent history.

Related completed work: [Devtools live observations and local history](../done/148b-devtools-live-history.md).
