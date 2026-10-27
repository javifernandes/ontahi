# 142h. Distributed Execution Topologies

Status: backlog

Canonical ID: `ontahi://plans/142h-distributed-execution-topologies`

Source plan: [142. Declarative Model Semantics And Execution Planning](../done/142-declarative-model-semantics-and-execution-planning.md)

## Summary

Investigate how one Ontahí semantic graph maps onto identified runtimes, execution authorities,
graph partitions, and deployment infrastructure without embedding one physical topology into the
domain program. Specify storage, execution, routing, replication, and convergence only after
concrete topology evidence exists.

This is deliberately WIP research. It records the semantic dimensions exposed by the current
`server-only` and `bridge` Operation vocabulary; it does not authorize replacing that vocabulary
before a second real topology proves the replacement.

Related plans:

1. [154. Semantic Program Kernel And Distributed Evaluation](../research/154-semantic-program-kernel-and-distributed-evaluation.md)
2. [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)
3. [159. Next.js Application Runtime Mount](../current/159-nextjs-application-runtime-mount.md)
4. [77. Domain Topology And Ontahí Explorer Layers](../next/77-domain-topology-and-graphos-layers.md)

## Working thesis

`local` is not a complete semantic location. It is always local **to an identified runtime
instance, graph segment, authority placement, or current evaluator**. Browser, Next.js, Express,
workflow, worker, and cluster are implementation categories; none is a stable semantic coordinate
by itself.

The current `exposure: 'server-only' | 'bridge'` vocabulary compresses at least four independent
questions:

1. **Invocation admission:** which runtimes or trust boundaries may request an Operation?
2. **Implementation availability:** which runtime kinds carry an implementation capable of
   evaluating it?
3. **Execution placement:** must evaluation happen at one authority, may it happen at the caller,
   or may a scheduler choose among eligible runtimes?
4. **Graph placement:** which runtime or partition owns the Entities and Relations touched by the
   resulting Reads, Commands, invariants, and effects?

These axes must not be collapsed into a future three-value exposure enum. A remotely invocable
Operation may execute at one authoritative runtime, while a portable Operation may execute in the
current evaluator and still route individual graph effects to several Entity authorities.

## Provisional topology elements

These names describe research concepts, not accepted TypeScript APIs.

| Element              | Provisional meaning                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `RuntimeIdentity`    | Stable identity of an evaluator or deployment participant, not merely its framework kind       |
| `RuntimeKind`        | Browser, web server, worker, workflow, model-backed executor, or another implementation class  |
| `CapabilitySet`      | Semantic program forms, implementations, guarantees, and resources a runtime can provide       |
| `GraphSegment`       | A set of Entity/Relation populations governed by one explicit routing and consistency boundary |
| `PlacementPolicy`    | Trusted application rule mapping graph population or execution work to eligible runtimes       |
| `PartitionKey`       | Domain-derived routing identity such as tenant, workspace, region, or Entity locator component |
| `ExecutionAuthority` | Runtime placement allowed to commit a particular effect or preserve a required invariant       |
| `EvaluationRoute`    | Inspectable decision to execute here, dispatch elsewhere, split evaluation, or reject          |

Runtime identity, authenticated Principal, tenant identity, graph identity, and cache
`ExecutionIdentity` remain distinct. A client claim cannot select a privileged placement or move an
effect to another authority.

## Candidate semantic cases

1. **Authority-bound Operation:** invocable only inside its admitted execution authority. This is
   the durable meaning currently approximated by `server-only`; it must not mean “any server”.
2. **Remotely invocable authority Operation:** visible to other runtimes through Runtime Protocol,
   but executed by the runtime or replica set owning the required authority. This is the current
   `bridge` case.
3. **Portable Operation implementation:** an eligible runtime evaluates the Operation code where it
   is already running. Its graph Reads and Commands may still route independently to the authority
   of each affected Entity population.
4. **Scheduled eligible execution:** several runtimes can preserve the contract, and trusted
   placement policy selects one according to load, locality, cost, tenant tier, or availability.

The same application may therefore place one Entity subgraph in a shared cluster, another in a
specialized service, and selected tenant partitions in dedicated capacity. That is a topology of
the semantic graph, not a requirement to split domain meaning into service-specific APIs.

## Example research scenario

Atlas-like workspaces provide a useful future proof without becoming scope for this plan:

```text
Workspace partition key
  shared tier  -> shared graph segment / shared executor pool
  premium tier -> dedicated graph segment / dedicated executor pool

Portable Operation starts in an eligible runtime
  -> reads Source metadata from the workspace's authority
  -> invokes reconciliation at the placement that owns that partition
  -> emits progress through a separately capable durable runtime
```

The semantic identities of Workspace, Source, reconciliation, and progress remain stable while
placement changes. A pricing tier may influence trusted placement policy; it must not become domain
authorization or caller-selected authority.

## Scope

1. Model storage and execution topology independently from authored domain semantics.
2. Distinguish authority-serialized guarantees from separately proven merge-safe guarantees.
3. Record offline queueing, replication, conflict, retry, and reconciliation assumptions.
4. Define inspectable availability when a runtime cannot satisfy the required guarantees.
5. Separate Operation invocation admission, implementation availability, execution placement, and
   graph placement.
6. Model partitioning by Entity population or domain identity, including tenant-specific placement,
   without turning deployment coordinates into portable caller authority.
7. Let reflection and observability explain the selected route and its required guarantees.

## Non-Goals

1. Do not promise generic distributed transactions.
2. Do not equate eventual consistency, CRDT use, or retry with invariant preservation.
3. Do not publish a capability vocabulary without a concrete second topology.
4. Do not rename `server-only` or `bridge`, add a third exposure value, or promise code mobility in
   this research phase.
5. Do not treat Kubernetes, regions, pods, framework names, or pricing tiers as intrinsic domain
   semantics.
6. Do not infer distributed transactions across graph segments.

## Research slices

1. Inventory the meanings currently carried by Operation exposure, graph bindings, runtime
   capabilities, execution identity, and authority.
2. Prove one application composed from two explicitly identified graph segments.
3. Add one portable Operation proof whose evaluation and graph-effect placement differ.
4. Add one partitioned population proof, such as two tenants with distinct placement, and show that
   the same Entity and Operation identities survive routing.
5. Make selected route, rejected guarantees, correlation, and cross-runtime causality observable.
6. Only then propose a minimal reflected vocabulary and migration from current exposure metadata.

## Open questions

1. Is a graph segment declared over Entity types, Entity populations, Relations, locator ranges, or
   a composition of these?
2. Which semantic guarantees travel with an Operation implementation, and which belong to each
   effect it requests?
3. How is portable implementation code identified, versioned, verified, and admitted without
   shipping secrets or privileged dependencies to an untrusted runtime?
4. When can evaluation split safely, and when must a complete Unit of Work remain inside one
   authority-serialized placement?
5. How do Refs retain stable identity while resolution crosses partitions or moves between them?
6. Which consistency and failure semantics are visible in the semantic program versus supplied by
   environment bindings?
7. Can tenant-specific placement remain entirely application configuration, or must reflected
   topology expose a semantic partition identity for diagnostics and policy?
8. What is the equivalent of capability negotiation between independently versioned runtimes?

## Acceptance Checklist

- [ ] One concrete distributed topology supplies the motivating evidence.
- [ ] Required guarantees are semantic and testable rather than provider labels.
- [ ] Authority-serialized and merge-safe execution remain distinct.
- [ ] Unsupported execution is explicit and fail-closed.
- [ ] Every use of “local” names the runtime, evaluator, segment, or authority it is relative to.
- [ ] Invocation admission and execution placement can vary independently.
- [ ] One portable Operation executes outside the authority that owns at least one of its graph
      effects without weakening that effect's policy or consistency boundary.
- [ ] One domain-derived partition routes different Entity populations to different placements
      while retaining common semantic identities.
- [ ] Reflection can explain why an Operation executes here, dispatches elsewhere, or is unavailable.
