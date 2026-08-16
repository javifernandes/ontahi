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
  - bookops://plans/100a-ontahi-react-graph-provider-spike
  - bookops://plans/100b-ontahi-react-graph-query-boundary
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/react-graph-surface
sourceCommit: 67713696
---

React Graph Surface is the public React configuration and hook layer for Ontahi graph runtime access.

It should expose the framework-facing entrypoint `@ontahi/react/graph`, not `@ontahi/react/data-graph`.

The first stable shape now exists in `@ontahi/react/graph` and focuses on provider/context configuration plus generic graph and reflected runtime hooks:

1. runtime injection,
2. graph client cache access,
3. operation bridge adapter registration,
4. context hooks for consumers below the provider,
5. React Query-aware operation cache reconciliation,
6. bridge operation hooks such as `useOperation`, `useDurableOperation`, `useOperationQuery`, `useOperationInfiniteQuery`, `useGraphPermission`, and `useOperationRunner`,
7. reflected entity data reader support for Explorer-like dynamic entity browsing,
8. reflected operation invoker support for executing descriptor-discovered operations by `operationId + input`.

BookOps remains the host that creates its concrete runtime, chooses adapters, and wires domain graph declarations. The host currently wraps `OntahiGraphProvider` with a BookOps-local `DataGraphRuntimeProvider` to preserve app defaults while consuming the generic package surface.

The package-side materialization lives under [`@ontahi/react`](./source-code-organization/react.md), which supports this framework-facing React graph surface.

Graph query/command hooks now live in `@ontahi/react/graph` behind a host-supplied graph executor. BookOps keeps the concrete browser executor adapter that translates its Effect-based runtime helpers into Promise-returning executor methods.

Dynamic reflected operation execution now goes through a host-supplied invoker instead of directly reaching for the operation bridge adapter. That is a deliberate intermediate step toward modeling framework metadata as graph entities and operations.

Generated operation schemas also define the public hook input. `useOperation` and
`useOperationQuery` normalize client-friendly values before transport, so an Entity Ref may satisfy
a singleton Selection input in both mutations and reads.

This keeps `@ontahi/react/graph` free of BookOps imports, Supabase option aliases, and runtime singleton assumptions while letting `useGraphQuery`, `useGraphCommand`, `useGraphOperation`, reflected entity data hooks, and reflected operation execution become reusable framework hooks.
