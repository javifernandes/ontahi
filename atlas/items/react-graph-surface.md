---
id: ontahi.react-graph-surface
kind: system-primitive
title: React Graph Surface
parent: ontahi.application-architecture-surface
status: shaping
horizon: now
supports:
  - ontahi
  - ontahi.domain-topology-graphos
relatedPlans:
  - ontahi://plans/100a-ontahi-react-graph-provider-spike
  - ontahi://plans/100b-ontahi-react-graph-query-boundary
  - ontahi://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/react-graph-surface
sourceCommit: 67713696
---

React Graph Surface is the public React configuration and hook layer for Ontahi graph runtime access.

It should expose the framework-facing entrypoint `@ontahi/react/graph`, not `@ontahi/react/data-graph`.

The first stable shape now exists in `@ontahi/react/graph` and focuses on provider/context
configuration plus generic graph and reflected runtime hooks:

1. runtime injection,
2. graph client cache access,
3. operation bridge adapter registration,
4. context hooks for consumers below the provider,
5. React Query-aware operation cache reconciliation,
6. bridge operation hooks such as `useOperation`, `useDurableOperation`, `useOperationQuery`, `useOperationInfiniteQuery`, `useGraphPermission`, and `useOperationRunner`,
7. reflected entity data reader support for Explorer-like dynamic entity browsing,
8. reflected operation invoker support for executing descriptor-discovered operations by
   `operationId + input`,
9. portable generated-Entity Query entry points and semantic read intents,
10. canonical Query keys partitioned by a portable execution identity.

An application remains the host that creates its runtime, chooses adapters, and wires domain graph
declarations. `OntahiGraphProvider` installs a lazy conventional same-origin Fetch client by
default, while configured client bundles, individual capability overrides, and `client={false}`
preserve explicit composition for non-conventional hosts.

The package-side materialization lives under [`@ontahi/react`](./source-code-organization/react.md), which supports this framework-facing React graph surface.

Graph Query and Command hooks live in `@ontahi/react/graph` behind one executor contract. The
current Fetch client implements remote Queries and the graph transport implements explicitly
permitted Relationship Commands. A first-class React execution facade for Entity-bound
Relationship Commands remains pending; generic Entity Commands still require their own protocol
and write-policy boundary.

Dynamic reflected operation execution now goes through a host-supplied invoker instead of directly reaching for the operation bridge adapter. That is a deliberate intermediate step toward modeling framework metadata as graph entities and operations.

Generated operation schemas also define the public hook input. `useOperation` and
`useOperationQuery` normalize client-friendly values before transport, so an Entity Ref may satisfy
a singleton Selection input in both mutations and reads.

Generated client Entities now expose `all()` and `where(...)`. `useGraphQuery` derives execution
mode from the Query's semantic intent (`first`, strict `one`, `count`, or `exists`) and derives its
ordinary cache key from the canonical graph program. `ExecutionIdentity` partitions that cache
across principal, tenant, workspace, or another JSON-safe scope; it is distributed-state identity,
not a credential or server authorization input.

`useOperation` accepts either an Operation declaration for reusable input-at-execution mutations or
a bound `Entity.domain.operation(input)` invocation for zero-argument execution with the latest
render-owned input.

This keeps `@ontahi/react/graph` free of host imports, provider option aliases, and runtime
singleton assumptions while letting `useGraphQuery`, `useGraphCommand`, `useGraphOperation`,
reflected entity data hooks, and reflected operation execution remain reusable framework hooks.
