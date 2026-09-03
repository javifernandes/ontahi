# 100b. Ontahi React Graph Query Boundary

Status: done

Canonical ID: `ontahi://plans/100b-ontahi-react-graph-query-boundary`

Migrated from: `bookops://plans/100b-ontahi-react-graph-query-boundary`
Original path: `plans/done/100b-ontahi-react-graph-query-boundary.md`
Source commit: `cb9c038a`

Source plan: [`100-ontahi-framework-extraction.md`](../done/100-ontahi-framework-extraction.md)

Follows: [`100a-ontahi-react-graph-provider-spike.md`](./100a-ontahi-react-graph-provider-spike.md)

Related atlas shapes:

1. [`ontahi.react-graph-surface`](ontahi://atlas/react-graph-surface)
2. [`ontahi.source-code-organization.react`](ontahi://atlas/source-code-organization/react)
3. [`ontahi.source-code-organization`](ontahi://atlas/source-code-organization)

## Summary

Design the next public boundary for moving graph query and command hooks from BookOps into `@ontahi/react/graph`.

This plan intentionally does not start by moving `useGraphQuery`, `useGraphCommand`, or `useGraphOperation`. Those hooks are currently small, but their dependencies are not small: they mix React Query orchestration, Ontahi graph runtime calls, Effect execution, BookOps browser runtime wiring, and Supabase runtime option types.

The desired extraction boundary is:

```txt
@ontahi/react/graph
  owns React hook orchestration
  consumes a host-supplied graph executor
  depends on @ontahi/core/data-graph and React Query

BookOps
  owns concrete browser runtime assembly
  owns Supabase option aliases
  adapts Effect-based runtime calls into the React graph executor
```

## Why This Matters

React package APIs become public framework surface quickly. If `@ontahi/react/graph` exposes BookOps-specific runtime defaults or Supabase-specific option names, the extraction will look successful in code movement but fail as framework design.

The real boundary is not "where does the hook file live?".

The real boundary is "what does a React Ontahi app need to provide so generic hooks can run graph reads and commands?".

## Current Couplings

The BookOps-local graph hooks currently depend on:

1. `@ontahi/core/data-graph` for graph read and command declarations,
2. React Query for query and mutation lifecycle,
3. `effect` for `exists` mode and runtime execution values,
4. BookOps runtime helpers such as `getBrowserGraphViewEffect()` and `runBrowserGraphCommandEffect()`,
5. BookOps `runBrowserEffect()` from `web/src/architecture/runtime/browser`,
6. `useGraphRuntime()` from the current provider context,
7. Supabase-specific runtime option aliases such as `BrowserGraphRuntimeOptions`.

Only the first two should be required by the public hook layer.

## Boundary Decision

`@ontahi/react/graph` should consume a Promise-returning graph executor, not an Effect runtime directly.

React Query query functions and mutation functions already speak `Promise`. A Promise executor keeps the public React hook contract aligned with common React conventions and avoids forcing every consumer to understand the Effect runtime in order to use basic graph hooks.

Ontahi core can remain Effect-based. The adapter from an Ontahi `DataGraphExecutionRuntime` to the Promise executor can be supplied by the host application or by a future helper that accepts a runtime plus an explicit effect runner.

## Proposed Public Contract

The framework-facing contract should be generic over read and command options:

```ts
import type { GraphCommandSpec, QueryOrView, QuerySpec } from '@ontahi/core/data-graph';

export type GraphReadMode = 'get' | 'run' | 'count' | 'exists';

export type BuildableGraphRead<TResult> = {
  build: () => QuerySpec<any, TResult>;
};

export type GraphReadSource<TResult = unknown> =
  | QueryOrView<any, TResult>
  | BuildableGraphRead<TResult>;

export interface ReactGraphExecutor<TReadOptions = unknown, TCommandOptions = TReadOptions> {
  get<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<TResult | null>;

  run<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<TResult[]>;

  count<TParams, TResult>(
    read: QueryOrView<TParams, TResult>,
    params: TParams,
    options?: TReadOptions,
  ): Promise<number>;

  runCommand<TResult = void>(
    command: GraphCommandSpec<any, any, TResult>,
    options?: TCommandOptions,
  ): Promise<TResult>;
}
```

The React provider can keep its current generic `runtime` prop for host code that needs direct runtime access, but graph query hooks should read a separate executor:

```tsx
<OntahiGraphProvider
  runtime={bookopsBrowserDataGraphRuntime}
  graphExecutor={bookopsReactGraphExecutor}
  clientCache={bookopsGraphClientCache}
  operationBridgeAdapters={[nextActionOperationBridgeAdapter]}
>
  {children}
</OntahiGraphProvider>
```

This preserves `useGraphRuntime()` for applications that need it while giving framework hooks a narrow, testable execution contract.

## BookOps Adapter Shape

BookOps should adapt its current runtime rather than exporting BookOps runtime helpers through Ontahi React.

The adapter should be local to BookOps at first:

```ts
export const bookopsReactGraphExecutor: ReactGraphExecutor<
  BrowserGraphRuntimeOptions,
  BrowserGraphCommandRuntimeOptions
> = {
  get: (read, params, options) =>
    runBrowserEffect(getBrowserGraphViewEffect(read, params, options), {
      dataGraphRuntime: bookopsBrowserDataGraphRuntime,
    }),
  run: (read, params, options) =>
    runBrowserEffect(runBrowserGraphViewEffect(read, params, options), {
      dataGraphRuntime: bookopsBrowserDataGraphRuntime,
    }),
  count: (read, params, options) =>
    runBrowserEffect(countBrowserGraphViewEffect(read, params, options), {
      dataGraphRuntime: bookopsBrowserDataGraphRuntime,
    }),
  runCommand: (command, options) =>
    runBrowserEffect(runBrowserGraphCommandEffect(command, options), {
      dataGraphRuntime: bookopsBrowserDataGraphRuntime,
    }),
};
```

The exact implementation may avoid closing over the singleton runtime if provider context should select the runtime dynamically. The important property is that `@ontahi/react/graph` receives a Promise-returning executor and does not import `runBrowserEffect`, Supabase, or BookOps runtime assembly.

## Hook Move Criteria

`useGraphQuery` can move into `@ontahi/react/graph` when:

1. it reads a `ReactGraphExecutor` from provider context,
2. `GraphQueryOptions` is generic over `TReadOptions`,
3. query key derivation does not mention Supabase option aliases,
4. unnamed query/selection reads still require an explicit `queryKey`,
5. `exists` mode is implemented by `executor.get()` plus `row != null`, not by importing Effect.

`useGraphCommand` can move when:

1. it reads the same executor from provider context,
2. `GraphCommandHookOptions` is generic over `TCommandOptions`,
3. command invalidation stays React Query-oriented,
4. the hook does not import BookOps runtime helpers.

`useGraphOperation` can move as a small wrapper over generic `useGraphCommand` when:

1. its operation type references `GraphOperationDeclaration` from `@ontahi/core/data-graph`,
2. it does not depend on generated BookOps operation metadata,
3. BookOps can keep a local compatibility re-export.

## Package Ownership

`@ontahi/react/graph` should own:

1. `ReactGraphExecutor` and related hook option types,
2. executor provider context and `useGraphExecutor()`,
3. generic `useGraphQuery`,
4. generic `useGraphCommand`,
5. generic `useGraphOperation`,
6. helper logic for resolving buildable graph reads and commands,
7. query-key derivation for named views.

BookOps should own:

1. concrete browser graph runtime creation,
2. Supabase runtime option aliases,
3. the adapter from BookOps runtime/effect execution to `ReactGraphExecutor`,
4. generated graph entity declarations and operation declarations,
5. compatibility exports through `web/src/data/graph/react.tsx` and `web/src/architecture/client.ts`.

## Implementation Order

1. [x] Add `ReactGraphExecutor` types and provider support in `@ontahi/react/graph`.
2. [x] Add package tests for hooks running against a host-supplied executor.
3. [x] Add a BookOps-local executor adapter around the current browser graph runtime helpers.
4. [x] Move `useGraphQuery` and its generic types into `@ontahi/react/graph`.
5. [x] Move `useGraphCommand` and `useGraphOperation`.
6. [x] Keep app imports stable through the BookOps `web/src/data/graph/react.tsx` facade and `@/architecture/client`.
7. [x] Run existing BookOps graph hook tests against the moved implementation.

## Implementation Result

The boundary materialized as planned.

`@ontahi/react/graph` now owns:

1. `ReactGraphExecutor`,
2. `useGraphExecutor()`,
3. generic graph query and command option types,
4. `useGraphQuery`,
5. `useGraphCommand`,
6. `useGraphOperation`.

BookOps now owns:

1. `createBookopsReactGraphExecutor()`,
2. the adapter from browser graph effects to Promise-returning executor methods,
3. Supabase browser runtime option aliases,
4. facade exports through `web/src/data/graph/react.tsx` and `web/src/architecture/client.ts`.

The public React hook implementation does not import BookOps files, `@ontahi/supabase`, or `effect`.

## Acceptance Checklist

- [x] Public React graph hooks do not import BookOps files.
- [x] Public React graph hooks do not import `@ontahi/supabase`.
- [x] Public React graph hooks do not import `effect`.
- [x] `@ontahi/react/graph` exposes a narrow graph executor contract.
- [x] BookOps supplies the executor through its existing `DataGraphRuntimeProvider` wrapper.
- [x] Existing app imports continue to work through compatibility exports.
- [x] Existing graph hook tests pass without changing feature callers.

## Open Questions

1. Should the public name be `ReactGraphExecutor`, `GraphExecutor`, or `GraphClient`?
2. Should `OntahiGraphProvider` require `graphExecutor` immediately, or should only hooks that need it throw when it is missing?
3. Should a future helper live in `@ontahi/react/graph` for adapting `DataGraphExecutionRuntime` plus an effect runner, or should that stay host-local until another app needs it?
4. Should stream reads get a separate React hook later, or remain outside this query boundary until the usage is clearer?
