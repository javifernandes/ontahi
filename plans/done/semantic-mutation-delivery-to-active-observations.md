# Semantic Mutation Delivery To Active Observations

Status: done

Canonical ID: `ontahi://plans/semantic-mutation-delivery-to-active-observations`

Related plans:

1. [154d. Semantic Mutation Journal And Query Invalidation](../done/154d-semantic-mutation-journal-and-query-invalidation.md)
2. [128h. Observable Query Runtime And Durable Progress](../done/128h-observable-query-runtime-and-durable-progress.md)
3. [148. Ontahí Devtools Runtime Inspection](../current/148-ontahi-devtools-runtime-inspection.md)

## Summary

Deliver the same bounded `CommittedMutationSet` used by an initiating React client to active
server-side Graph Read observations. A receiver should reevaluate an authored observation when a
committed mutation may affect it, without changing the Query, sending client cache inventories, or
conflating mutation occurrence with an Event or row stream.

## Scope

1. Register each active observation's canonical Graph Read once within its authority and runtime
   scope.
2. Match committed mutation sets conservatively through the existing `mayAffectGraphRead`
   contract.
3. Reevaluate possible overlaps and skip only provably disjoint observations.
4. Preserve receiver-owned authorization for every refreshed Read.
5. Define bounded delivery, teardown, backpressure, and failure semantics without introducing a
   distributed invalidation broker.
6. Expose explicit causal evidence for Plan 148 Devtools without inferring causality from timing.

## Non-Goals

1. No cross-region broker, offline replay, or persistent subscription inventory.
2. No general Selection intersection solver.
3. No client cache-key transport.
4. No claim that an observation refresh is an Event or an exact entity delta.

## Acceptance

- [x] A committed mutation refreshes a possibly overlapping active observation.
- [x] A provably disjoint observation does not reevaluate.
- [x] Failed and rolled-back mutations trigger no observation work.
- [x] Subscription authority is re-applied during reevaluation.
- [x] Closing an observation releases every mutation-delivery subscription.
- [x] Slow consumers and repeated mutations have an explicit bounded policy.
- [x] Devtools can relate the committed mutation and refresh through an explicit causal identity.

## Implemented Slice

The application Runtime Protocol now owns one process-local active-observation registry. Successful
direct Commands and Operations publish their sealed `CommittedMutationSet`; successful in-process
durable Operations retain the same delivery capability in their copied execution context and
publish only at terminal completion. Failed executions do not publish.

Each active canonical Graph Read keeps at most one pending semantic refresh. The existing
`mayAffectGraphRead` matcher skips only provably disjoint commits. A possible overlap reruns the
ordinary Graph Read dispatcher under the subscription's original authority, so policy and scope
are resolved again rather than retained as a grant. Native storage observation remains active in
parallel, and equal result snapshots from native and semantic sources are deduplicated.

This delivery is intentionally process-local and lossy: Graph Read reevaluation is the source of
truth, not a queued mutation log. Repeated commits coalesce while an observation is slow, and abort
or iterator teardown releases the registration and native observer.

## Completed Causal Slice

Each successful commit now receives a portable `mutationCommitId` outside the semantic mutation
set. The same identity is projected with an initiating response or terminal durable snapshot and
with every semantic Graph observation refresh it causes. Slow-observer coalescing retains at most
16 unique identities plus an overflow marker rather than growing a mutation log.

Devtools retains this identity independently of payload capture, groups proven derived refreshes
under their mutation Activity, and labels observation snapshots as native or semantic. No timing
heuristic, authority context, or domain Event is introduced.
