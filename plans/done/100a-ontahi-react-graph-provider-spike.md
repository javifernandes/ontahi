# 100a. Ontahi React Graph Provider Spike

Status: done

Canonical ID: `ontahi://plans/100a-ontahi-react-graph-provider-spike`

Migrated from: `bookops://plans/100a-ontahi-react-graph-provider-spike`
Original path: `plans/done/100a-ontahi-react-graph-provider-spike.md`
Source commit: `cb9c038a`

Source plan: [`100-ontahi-framework-extraction.md`](../done/100-ontahi-framework-extraction.md)

Related atlas shapes:

1. [`ontahi.react-graph-surface`](ontahi://atlas/react-graph-surface)
2. [`ontahi.source-code-organization.react`](ontahi://atlas/source-code-organization/react)
3. [`ontahi.application-architecture-surface`](ontahi://atlas/application-architecture-surface)
4. [`ontahi.domain-topology-graphos`](ontahi://atlas/domain-topology-and-graphos)
5. [`ontahi.model.durable-operation`](ontahi://atlas/model/durable-operation)

## Summary

Design and spike the public React graph configuration surface for Ontahi.

The target public entrypoint should be `@ontahi/react/graph`, not `@ontahi/react/data-graph`. "Data graph" can remain an internal or historical term, but framework consumers should configure and consume the graph through a shorter, product-level API.

This plan should not move every graph hook out of BookOps. The useful generic slice is the provider/context/cache/operation-bridge surface plus operation hooks that only depend on Ontahi core, `@ontahi/react/actions`, React, and React Query.

## Why This Matters

React framework integrations usually become legible through providers, context hooks, and host-supplied adapters. Ontahi should follow that convention instead of exposing BookOps-local runtime assembly as if it were a generic package API.

The design pressure is:

1. `@ontahi/react` should expose a framework-level graph surface,
2. BookOps should remain the host that provides runtime and adapter choices,
3. `@ontahi/react/graph` should not import BookOps, Supabase-specific options, or Next.js runtime code,
4. durable operation hooks should depend on the generic task run reference exported by Ontahi core, not the BookOps app facade.

## Atlas-Aware Context

This subplan is intentionally created under the Ontahi extraction line and linked to an Atlas shape. The durable shape is the **React Graph Surface**: the framework-facing React configuration and hook layer for graph runtime access, client cache, and operation bridge adapters.

This plan should later be a good target for the `ReviewPlanState` workflow from [`106-atlas-plan-reconciliation-operation.md`](bookops://plans/106-atlas-plan-reconciliation-operation): the reconciliation should be able to say which parts materialized into `@ontahi/react/graph`, which stayed BookOps-local, and which blockers moved into follow-up plans.

## Target API Sketch

BookOps should eventually configure Ontahi graph React runtime like this:

```tsx
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClientProvider } from '@tanstack/react-query';

export function BookOpsProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider
        runtime={bookopsGraphRuntime}
        clientCache={bookopsGraphClientCache}
        operationBridgeAdapters={[nextActionOperationBridgeAdapter]}
      >
        {children}
      </OntahiGraphProvider>
    </QueryClientProvider>
  );
}
```

The provider should not own `QueryClientProvider`. React Query already has a widely understood integration convention; Ontahi should compose with it.

Consumer code should eventually read like:

```ts
import { useGraphClientCacheSnapshot, useGraphRuntime } from '@ontahi/react/graph';
```

Later slices may add:

```ts
import { useGraphQuery } from '@ontahi/react/graph';
```

but only after the runtime, effect-runner, and Supabase-option boundaries are clean.

## First Slice

The initial slice moved only the generic provider/context surface:

1. `OntahiGraphProvider`
2. `useGraphRuntime`
3. `useGraphClientCache`
4. `useGraphClientCacheSnapshot`
5. `useGraphClientCacheVersion`
6. `useOperationBridgeAdapter`
7. `useDefaultOperationBridgeAdapter`
8. `useHasOperationBridgeRuntime`

The first slice should require the host app to pass a runtime. It should not preserve the current BookOps-local default of `createBookopsBrowserDataGraphRuntime()` inside the generic provider.

## Generic Operation Hook Slice

After the provider surface proved clean, the next slice moved operation bridge hooks whose dependencies are now generic:

1. `useOperation`
2. `useDurableOperation`
3. `useOperationQuery`
4. `useOperationInfiniteQuery`
5. `useGraphPermission`
6. `useOperationRunner`
7. operation cache reconciliation helpers shared by React Query and Ontahi graph client cache

This slice depends on `@ontahi/core/data-graph`, `@ontahi/core/runtime/server`, `@ontahi/react/actions`, React, and React Query. It still does not depend on BookOps, Supabase, or Next.js.

## Current Couplings To Remove Or Defer

At the start of this spike, BookOps graph React code was not ready to move wholesale because it still depended on:

1. `createBookopsBrowserDataGraphRuntime()` from BookOps runtime assembly,
2. `runBrowserEffect` from the BookOps architecture runtime facade,
3. Supabase-specific runtime option types in hook options,
4. generated BookOps graph declarations and operation metadata,
5. local graph runtime assumptions that need a clearer framework contract before becoming public API.

These are not reasons to stop extraction. They are the spike map.

## TaskRunRef Outcome

`TaskRunRef` looked like a blocker because BookOps imported it through `@/architecture/bootstrap`.

The actual ownership is already generic: `TaskRunRef` is defined in `@ontahi/core/runtime/server/tasks` and exported through `@ontahi/core/runtime/server`. That means `useDurableOperation` can move into `@ontahi/react/graph` without depending on BookOps.

The remaining smell is naming and public API ergonomics, not package ownership. A future cleanup can still decide whether the client-facing name should become `DurableTaskRunRef`, but this no longer blocks React graph extraction.

BookOps graph React types now re-export the generic operation hook types from `@ontahi/react/graph` instead of defining them around the app facade.

## Spike Result

The provider/context slice and generic operation hook slice materialized in `@ontahi/react/graph`.

The generic package now owns:

1. `OntahiGraphProvider`,
2. graph runtime context access,
3. graph client cache context access and snapshot subscription,
4. operation bridge adapter registry lookup,
5. operation cache reconciliation helpers that compose Ontahi graph client cache with React Query,
6. bridge operation hooks: `useOperation`, `useDurableOperation`, `useOperationQuery`, `useOperationInfiniteQuery`, `useGraphPermission`, and `useOperationRunner`.

BookOps now consumes that provider through its local `DataGraphRuntimeProvider` wrapper. The wrapper preserves the existing BookOps host defaults by injecting `bookopsBrowserDataGraphRuntime` and adapting the previous `bridgeAdapters` prop name to the public `operationBridgeAdapters` package API.

BookOps initially kept compatibility shims in `web/src/data/graph/react/**` so current app imports did not churn while the generic implementation moved into `@ontahi/react/graph`. Follow-up subplan 100b removed the pure pass-through shims and left only the BookOps provider wrapper, executor adapter, and facade exports.

Resolved by follow-up subplan [`100b-ontahi-react-graph-query-boundary.md`](./100b-ontahi-react-graph-query-boundary.md):

1. `useGraphQuery`, `useGraphCommand`, and `useGraphOperation` moved into `@ontahi/react/graph` behind a host-supplied graph executor,
2. BookOps keeps the adapter from its browser Effect runtime and Supabase runtime options to that executor,
3. BookOps graph entities, operation declarations, runtime defaults, and generated graph metadata stay application-local.

## Acceptance Checklist

- [x] Add or confirm the public package entrypoint name `@ontahi/react/graph`.
- [x] Define the provider props and exported context hooks without BookOps imports.
- [x] Move only provider/context/cache/operation-bridge registry code that can stay generic.
- [x] Keep BookOps runtime creation, graph declarations, operation declarations, and host wiring in BookOps.
- [x] Add package-level tests for provider wiring, cache defaults, and adapter lookup behavior.
- [x] Update BookOps to consume the generic provider if the slice proves clean; otherwise document the exact blocker.
- [x] Keep `useGraphQuery` and `useGraphCommand` out of the generic package until their dependencies become clearly generic.
- [x] Move generic operation bridge hooks once `TaskRunRef` ownership is confirmed in Ontahi core.
- [x] Update Plan 100 and the `ontahi.react-graph-surface` Atlas item with the result of the spike.

## Out Of Scope

1. No `@ontahi/explorer-react` or Ontahi Explorer UI extraction.
2. No public `@ontahi/react/data-graph` entrypoint.
3. No BookOps-specific graph runtime or Supabase option surface in `@ontahi/react`.
4. No attempt to make Ontahi graph fully open-source-ready in this slice.

## Constraints And Defaults

1. Prefer React-native configuration conventions: provider at the app boundary, hooks below it.
2. Keep `QueryClientProvider` external.
3. Keep framework packages independent of BookOps imports.
4. Treat names as public API. Prefer `graph` over `data-graph` in `@ontahi/react`.
5. If a hook needs BookOps runtime assembly, leave it in BookOps and write down why.
