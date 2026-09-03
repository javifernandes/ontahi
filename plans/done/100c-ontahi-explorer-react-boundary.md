# 100c. Ontahi Explorer React Boundary

Status: done

Canonical ID: `ontahi://plans/100c-ontahi-explorer-react-boundary`

Migrated from: `bookops://plans/100c-ontahi-explorer-react-boundary`
Original path: `plans/done/100c-ontahi-explorer-react-boundary.md`
Source commit: `cb9c038a`

Source plan: [`100-ontahi-framework-extraction.md`](../done/100-ontahi-framework-extraction.md)

Follows:

1. [`100a-ontahi-react-graph-provider-spike.md`](./100a-ontahi-react-graph-provider-spike.md)
2. [`100b-ontahi-react-graph-query-boundary.md`](./100b-ontahi-react-graph-query-boundary.md)

Related atlas shapes:

1. [`ontahi.source-code-organization.explorer-react`](ontahi://atlas/source-code-organization/explorer-react)
2. [`ontahi.domain-topology-graphos`](ontahi://atlas/domain-topology-and-graphos)
3. [`ontahi.source-code-organization`](ontahi://atlas/source-code-organization)

## Summary

Establish and incrementally extract the reusable explorer UI package as `@ontahi/explorer-react`.

This replaces the earlier placeholder target `@ontahi/ui-react`. The old name was technically plausible but too broad: Ontahi may eventually have other UI packages, and this package is specifically the React implementation of the Ontahi Explorer surface.

The extraction should not move `web/src/components/internal/graph-ops/**` as a whole. It should start with a boundary and inventory, then move reusable clusters behind explicit Explorer contracts and BookOps compatibility aliases.

## Naming Decision

Use these names:

1. **Ontahi Explorer**: the product-facing reflective UI surface.
2. **`@ontahi/explorer-react`**: the React package that contains reusable Explorer contracts, components, and hooks.
3. **GraphOS**: the conceptual/model vocabulary for layered domain topology, contracts, runtime, authority, resources, and relationships.
4. **GraphOps**: the historical/current BookOps implementation name for the internal console and descriptor code.

Do not use:

1. `@ontahi/ui-react`: too broad and likely to become a miscellaneous component bucket.
2. `@ontahi/ui-explorer-react`: accurate but clunky; it reads like a UI subfolder rather than a package identity.

## Target Package Responsibility

`@ontahi/explorer-react` should eventually own reusable React surfaces for:

1. Explorer shell/navigation,
2. entity and relation browsing,
3. operation browsing and execution UI,
4. event and task browsing,
5. schema/contract display,
6. topology and layer visualization,
7. authority/runtime/resource inspection.

The package should consume generic descriptor contracts rather than importing BookOps routes, BookOps actions, generated domain registries, or application auth helpers.

## BookOps Responsibility

BookOps should keep:

1. internal route definitions under `web/src/app/internal/graph/**`,
2. access control such as `requireGraphOpsConsoleAccess()`,
3. server actions that execute BookOps operations,
4. descriptor assembly from BookOps graph/entity/task registries,
5. host-specific data loading and mutation wiring,
6. compatibility aliases while `GraphOps` names are gradually replaced.

## First Implementation Boundary

The first code extraction should not move the whole console.

Inventory `web/src/components/internal/graph-ops/**` into:

1. generic presentational components that can move first,
2. components that consume generic descriptor contracts but still need type extraction,
3. components coupled to BookOps server actions or routes,
4. host-only wrappers that should remain in BookOps.

Likely early candidates are small display and navigation helpers. The operation execution panel, entity data browser, and task run views need more careful contracts because they reach into server actions, descriptors, and app runtime assumptions.

## Boundary Inventory

Current implementation is split across three layers:

| Layer                                     | Current location                                                                                | Extraction decision                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host routes, access, and server actions   | `web/src/app/internal/graph/**`                                                                 | Keep in BookOps. These own `/internal/graph`, `requireGraphOpsConsoleAccess()`, server action execution, task source loading, and route-level data fetching.   |
| Descriptor assembly and live data loading | `web/src/features/internal/graph-ops/**`                                                        | Keep assembly in BookOps for now. Promote only the neutral descriptor/data contracts into Explorer once they no longer import BookOps runtime types.           |
| React UI and browser state                | `ontahi-explorer-react/src/**` plus thin adapters in `web/src/components/internal/graph-ops/**` | Mostly extracted. BookOps keeps only Next.js/theme/auth shell configuration, Mermaid rendering, task-run loaders, and the chapter path/TOC ref-input override. |

Component inventory:

| Current file(s)                                                                                    | Classification                                                | Extraction decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph-ops-display-name.ts`, `graph-ops-collapsible-subsection.tsx`, `graph-ops-filter-select.tsx` | Former generic display wrappers plus one host control         | Display name and collapsible section are extracted as `Explorer*` components and their local wrappers are gone. `filter-select` remains BookOps-private because it only supports the chapter path/TOC picker.                                                                                                                                                                                                                                                                                                                                                    |
| `graph-ops-json-editor.tsx`                                                                        | Generic editor wrapper with app theme coupling                | Extracted as `ExplorerJsonEditor`. `@ontahi/explorer-react` owns Monaco like GraphiQL owns its editor; the integration boundary is theme configuration, not an editor adapter.                                                                                                                                                                                                                                                                                                                                                                                   |
| `graph-ops-operation-signature.tsx`                                                                | Descriptor-rendering component                                | Extracted as `ExplorerOperationSignature` after descriptor types moved to neutral `ExplorerOperationDescriptor` / `ExplorerSchemaField` names.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `graph-ops-entity-detail.tsx`                                                                      | Former mixed detail compatibility surface                     | Split and fully removed from BookOps after its schema, operation, task, entity structure, and entity operations/tasks panels moved into Explorer. Its local-only tests were removed with it; package tests cover the extracted behavior.                                                                                                                                                                                                                                                                                                                         |
| `graph-ops-overview.tsx`                                                                           | Former descriptor-only dashboard wrapper                      | Extracted as `ExplorerOverview`, then removed locally. The BookOps overview route renders the package component directly under the shared host layout.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `graph-ops-events-browser.tsx`                                                                     | Former descriptor-only browser wrapper                        | Extracted as `ExplorerEventBrowser`, then removed locally. Both BookOps event routes render the package component directly under the shared host layout.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `graph-ops-operations-browser.tsx`                                                                 | Thin runtime-backed host adapter                              | `ExplorerOperationsBrowser` owns the browser. BookOps passes only the chapter path/TOC `renderRefInput` override and no longer wraps its own shell.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `graph-ops-entity-browser.tsx`                                                                     | Thin runtime-backed host adapter                              | `ExplorerEntityBrowser` owns the browser and default Data tab. BookOps passes Mermaid rendering and the chapter path/TOC `renderRefInput` override and no longer wraps its own shell.                                                                                                                                                                                                                                                                                                                                                                            |
| `graph-ops-tasks-browser.tsx`                                                                      | Thin task-loading host adapter                                | `ExplorerTasksBrowser` owns the browser. BookOps injects task-run refresh/source loaders through server actions and no longer wraps its own shell.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `graph-ops-routes.ts`, `graph-ops-explorer-shell.tsx`, `/internal/graph/layout.tsx`                | Package-owned navigation with host integration                | Explorer owns collection/detail route shapes, navigation, and the shared shell. BookOps keeps the `/internal/graph` mount constant, query-param parsers and mounted hrefs, plus one adapter that supplies the Next.js pathname, app theme, Home link, and auth user menu. The App Router layout mounts that adapter once for the whole Explorer subtree.                                                                                                                                                                                                         |
| `use-graph-ops-operation-executor.ts`, `graph-ops-operation-ref-input.tsx`                         | Operation execution helpers plus host-specific input controls | Generic execution was extracted as Explorer operation executor helpers plus `ExplorerOperationExecutePanel`, then cleaned up locally. `@ontahi/core/data-graph` owns reflected operation invocation contracts, `@ontahi/react/graph` owns the provider-side reflected operation invoker and reflected entity data hooks, and BookOps supplies fetch-based adapters through its provider. The obsolete BookOps execute-panel wrapper is gone; BookOps keeps `graph-ops-operation-ref-input.tsx` only for the chapter path/TOC picker exposed as `renderRefInput`. |
| `use-graph-ops-entity-data-browser.ts`, `graph-ops-entity-data-panel.tsx`                          | Entity data browsing UI plus host data action                 | Extracted through the reflected entity data boundary. `@ontahi/core/data-graph` owns the query/result/reader types, `@ontahi/react/graph` owns the provider hook, and `@ontahi/explorer-react` owns the paging/filter/sort state machine plus default data panel. BookOps keeps only the temporary reader adapter around its server action until meta-entities and operations make this bridge unnecessary.                                                                                                                                                      |
| `use-graph-ops-task-runs.ts`, task-run portions of `graph-ops-tasks-browser.tsx`                   | Task run browser plus BookOps task runtime types/actions      | Browser state and run rendering are extracted into `ExplorerTasksBrowser`; the local hook was removed. BookOps still owns the task-run store, access checks, and server actions that satisfy the package loaders.                                                                                                                                                                                                                                                                                                                                                |
| `schema-descriptor.ts`, `graph-ops-descriptors.ts`, `graph-ops-data.ts`                            | Server/reflection descriptor and data adapter                 | Partially extracted. `@ontahi/explorer-react/server` now owns schema description and generic snapshot/entity/task/operation descriptor building. `@ontahi/supabase/data-graph` owns the Supabase reflected entity data reader. BookOps keeps the graph/task registry adapter, app event metadata, access-controlled server actions, task-run reconciliation, and service-role client factory.                                                                                                                                                                    |
| Component tests beside the files above                                                             | Safety net                                                    | Move or rewrite alongside the extracted cluster. Keep BookOps integration tests for host adapter behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Descriptor Contract Direction

The reusable package does not expose `GraphOps*` as its public API. Package and BookOps host code now use neutral Explorer names directly:

1. `ExplorerSnapshot`
2. `ExplorerMetric`
3. `ExplorerEntityDescriptor` and `ExplorerEntityDetail`
4. `ExplorerOperationDescriptor`
5. `ExplorerTaskDescriptor`
6. `ExplorerEventDescriptor`
7. `ExplorerSchemaDescriptor` and `ExplorerSchemaField`
8. `ExplorerEntityDataQuery` and `ExplorerEntityDataResult`
9. `ExplorerTaskRunListItem` and `ExplorerTaskRunSource`

BookOps can continue assembling these contracts from `BookopsDataGraphApi`, task registries, Supabase mappings, and app runtime stores. Explorer should receive already-shaped descriptors and host adapters.

## Theme And Editor Decision

Explorer should behave more like GraphiQL than like a bag of pluggable widgets:

1. `@ontahi/explorer-react` owns `@monaco-editor/react` and the JSON/expression editor UX.
2. Embedded hosts can pass a theme preference or wrap Explorer with `ExplorerThemeProvider`.
3. Standalone Explorer defaults to `system` theme resolution, so it does not require a host theme provider.
4. Collapsible sections are package-owned UI primitives, not adapters; the old coupling was naming and a BookOps `cn` helper, not domain behavior.
5. Entity reference links are package-owned plain anchors generated from Explorer routes. Embedded hosts configure only the mount `basePath`; the route shape below that belongs to Explorer, not the app.
6. If a host later needs to observe Explorer navigation, prefer explicit Explorer events over host-owned rendering callbacks.
7. Future adapter work should be reserved for true host concerns: operation execute form extensions, entity data loading, task run loading, auth/access, and descriptor assembly.

## Implementation Checkpoint

Checkpoint 2026-07-16:

1. created workspace package `ontahi-explorer-react` published internally as `@ontahi/explorer-react`,
2. added public `@ontahi/explorer-react/contracts` with neutral `Explorer*` descriptor, entity-data, and task-run contracts,
3. changed BookOps `graph-ops-types.ts` into compatibility aliases from `Explorer*` to existing `GraphOps*` names,
4. moved `humanizeExplorerName`, `ExplorerOperationSignature`, `ExplorerFieldRow`, `ExplorerSchemaFields`, and `ExplorerSchemaStatusBadge` into `@ontahi/explorer-react/components`,
5. kept BookOps wrappers `humanizeGraphOpsName` and `GraphOpsOperationSignature` so app imports do not churn,
6. removed one UI type dependency on the BookOps architecture facade by using GraphOps task-run aliases in the task browser,
7. wired the new package into workspace, root build/typecheck/lint scripts, web dependencies, and `generate:actions`.

Checkpoint 2026-07-18:

1. moved `ExplorerCollapsibleSection` and `ExplorerSubsectionTitle` into `@ontahi/explorer-react/components`,
2. moved `ExplorerJsonEditor` into the package and made Monaco a package-owned dependency,
3. added `ExplorerThemeProvider`, `useExplorerTheme()`, and `resolveExplorerTheme()` so embedded hosts can pass light/dark/system without coupling to BookOps theme context,
4. moved `ExplorerSchemaPanel` into the package on top of package-owned collapsible, schema field, status, and JSON editor components,
5. moved descriptor-only operation detail panels into the package as `ExplorerOperationMetadata`, `ExplorerOperationIngress`, and `ExplorerTaskDetail`,
6. removed pure BookOps UI wrappers once local consumers imported Explorer components directly,
7. kept only the `GraphOpsJsonEditor` bridge because it still connects BookOps theme context to Explorer's package-owned editor,
8. moved `ExplorerEntityStructurePanel` and `ExplorerEventDetail` into the package,
9. added `ExplorerProvider` and package-owned Explorer route builders so entity references use a configurable mount `basePath`,
10. moved `ExplorerEventBrowser` into the package as the first descriptor-only browser with package-owned filtering, selection, event links, entity links, and local URL updates,
11. moved `ExplorerOverview` into the package as a descriptor-only dashboard with package-owned title/copy and route links,
12. moved `ExplorerOperationDetailPanel` into the package so operation schema/ingress/metadata rendering is shared and execution remains a host slot,
13. moved `ExplorerOperationsBrowser` into the package with package-owned catalog filtering, local route-shaped selection, operation tabs, schema/ingress/metadata rendering, and a host-provided `renderExecutePanel` slot,
14. moved `ExplorerEntityOperationsPanel` and `ExplorerEntityBrowser` into the package with package-owned entity filtering, selection, tabs, route-shaped URLs, structure, and operations/tasks rendering,
15. moved `ExplorerTasksBrowser` into the package with package-owned task filtering, selection, tabs, recent run rendering, refresh state, source payload display, and host-provided task-run loaders,
16. updated package tests for collapsible, JSON editor, schema panel, operation metadata, operation ingress, operation detail, task descriptor, entity structure, entity browser, event detail, event browser, overview, operations browser, tasks browser, and Explorer route behavior.

Checkpoint 2026-07-18, reflected entity data:

1. added reflected entity data query/result/reader contracts to `@ontahi/core/data-graph`,
2. added reflected entity data reader provider support and React Query hook orchestration to `@ontahi/react/graph`,
3. moved entity data browsing state and the default data panel into `@ontahi/explorer-react/components`,
4. made `ExplorerEntityBrowser` render the package-owned Data tab automatically when a reflected entity data reader is registered,
5. reduced BookOps entity data wiring to a temporary adapter over the existing internal server action.

Checkpoint 2026-07-18, reflected operation invocation:

1. added reflected operation descriptor/invocation/invoker contracts to `@ontahi/core/data-graph`,
2. added reflected operation invoker provider support to `@ontahi/react/graph`,
3. changed `useReflectedOperationRunner()` to invoke through the registered reflected operation invoker instead of reading the bridge adapter directly,
4. added a fetch-based reflected operation invoker for hosts that expose the current operation bridge endpoint,
5. moved operation input draft building, ref-expression parsing, scalar/ref field helpers, destructive/executable checks, and execution state into `@ontahi/explorer-react/components`,
6. moved the default reflected entity-ref selector into `@ontahi/explorer-react/components` as `ExplorerEntityRefInput`,
7. left the visual BookOps execute panel local because it still owns the BookOps chapter path/TOC picker and host form composition.

Checkpoint 2026-07-18, operation execute panel:

1. moved the default operation execute panel/form into `@ontahi/explorer-react/components` as `ExplorerOperationExecutePanel`,
2. made the package own scalar, enum, boolean, structured JSON, generic entity-ref, destructive confirmation, JSON/expression inspector, result, error, validation, permission, and runtime-result rendering,
3. added `renderRefInput` as a narrow host extension seam for relation-path UX that Ontahi cannot infer yet,
4. initially reduced BookOps `GraphOpsOperationExecutePanel` to theme wiring plus the chapter path/TOC picker override,
5. removed the old BookOps `GraphOpsJsonEditor` wrapper because Explorer owns Monaco and accepts theme directly.

Checkpoint 2026-07-18, default operation execution in Explorer surfaces:

1. made `ExplorerOperationDetailPanel` mount `ExplorerOperationExecutePanel` by default when a reflected operation invoker is registered and the operation descriptor is executable,
2. made `ExplorerOperationsBrowser` and `ExplorerEntityOperationsPanel` show the Execute tab from runtime capability instead of requiring a host `renderExecutePanel`,
3. threaded `renderRefInput` through operation/entity browsers as the normal host seam for richer entity-ref controls,
4. kept `renderExecutePanel` as an exceptional full-panel override for future hosts, not the BookOps default path,
5. reduced BookOps GraphOps browsers/details to `ExplorerProvider` theme/base-path configuration plus the chapter path/TOC ref-input override.

Checkpoint 2026-07-18, BookOps execute wrapper cleanup:

1. removed the obsolete BookOps `GraphOpsOperationExecutePanel` wrapper,
2. renamed the remaining host-specific file to `graph-ops-operation-ref-input.tsx`,
3. kept `renderGraphOpsOperationRefInput` as the only BookOps operation execution UI seam,
4. moved generic execute-panel control coverage into `@ontahi/explorer-react`,
5. reduced the BookOps test suite to ordinary-ref fallback and the chapter path/TOC picker integration.

Checkpoint 2026-07-18, Explorer server/reflection boundary:

1. added public `@ontahi/explorer-react/server` for package-owned schema description and generic descriptor assembly,
2. moved `schema-descriptor.ts` into the package and kept BookOps schema fixtures as host integration tests,
3. added `buildExplorerSnapshot()`, `getExplorerEntityDetail()`, and related neutral `Explorer*` server input types,
4. reduced BookOps `graph-ops-descriptors.ts` to host registry wiring, app event descriptors, task definitions, and task-run reconciliation,
5. moved display metadata normalization into `@ontahi/core/data-graph` as `describeReflectedEntityDisplay()`,
6. extracted `createSupabaseReflectedEntityDataReader()` and `listSupabaseReflectedEntityData()` into `@ontahi/supabase/data-graph`,
7. reduced BookOps `graph-ops-data.ts` to creating the Supabase reader with `BookopsDataGraphApi.listEntities()` and `createServiceRoleSupabaseClient()`.

Checkpoint 2026-07-19, Explorer routes and shell:

1. expanded the package-owned route contract with overview and collection routes in addition to detail routes,
2. added `ExplorerSectionNav` with package-owned section labels, hrefs, active-section logic, and plain anchors,
3. added `ExplorerShell` with the shared page frame, `ExplorerProvider`, navigation, optional host Home link, and optional trailing header content,
4. replaced repeated BookOps page frames with one `GraphOpsExplorerShell` adapter that supplies `usePathname()`, the BookOps theme, Home, and the auth user menu,
5. removed the old BookOps `GraphOpsSectionNav` implementation while keeping Next.js route pages and access control local.

Checkpoint 2026-07-19, BookOps host cleanup:

1. mounted `GraphOpsExplorerShell` once in `/internal/graph/layout.tsx` so the Explorer provider and frame persist across route navigation,
2. removed repeated shell composition from the entity, operations, and tasks host adapters,
3. removed the local overview and events wrappers and made their route pages render package components directly,
4. removed the dead `graph-ops-entity-detail.tsx` compatibility surface and its local-only detail tests,
5. removed `graph-ops-types.ts` and changed BookOps adapters to import public Ontahi contracts directly,
6. reduced `graph-ops-routes.ts` to the host mount path, query-param parsing, and mounted href construction.

Still local to BookOps:

1. graph/task/app registry wiring into the generic Explorer descriptor builder,
2. `/internal/graph` routes and access control,
3. server actions and API routes for reflected entity data loading, operation bridge invocation, and task run source loading,
4. app-specific event descriptor metadata,
5. the BookOps chapter path/TOC picker, service-role client creation, task-run store/source implementations, Mermaid rendering, and the thin pathname/theme/auth shell adapter mounted by the Next.js layout.

## Extraction Order

1. Define neutral Explorer descriptor/data/task-run contracts without importing from `web/src/architecture/**`.
2. Scaffold `@ontahi/explorer-react` with no route ownership and only peer/runtime dependencies that are clearly intended for the package.
3. Extract the smallest display cluster: display-name, collapsible subsection, operation signature, and schema/field rendering helpers.
4. Use `ExplorerProvider basePath` for package-owned route generation. Theme remains package-owned configuration unless future standalone Explorer needs a fuller design system API.
5. Extract descriptor-driven browsers in slices once they can consume Explorer routes instead of `next/link`, `next/navigation`, `/internal/graph` route helpers, or BookOps server actions. Add reflected operation invocation, reflected entity-data, or task-run adapters only where the browser truly performs host work.
6. Leave BookOps `web/src/app/internal/graph/**` as the host implementation that configures Explorer and enforces access control.

## Acceptance Checklist

- [x] Rename the planned package target from `@ontahi/ui-react` to `@ontahi/explorer-react`.
- [x] Document Ontahi Explorer as the public UI surface.
- [x] Keep GraphOS as conceptual topology/model vocabulary.
- [x] Avoid moving or renaming code in this naming slice.
- [x] Inventory GraphOps components before the first code extraction.
- [x] Define the descriptor contract that `@ontahi/explorer-react` consumes.
- [x] Extract the first component cluster only after BookOps host responsibilities are explicit.
- [x] Extract the package-owned collapsible, JSON editor, theme bridge, and schema panel without introducing unnecessary adapters.
- [x] Extract descriptor-only operation metadata, operation ingress, and task detail panels before designing host adapters.
- [x] Remove pure compatibility wrappers after consumers move to direct Explorer imports.
- [x] Extract entity structure and event detail with package-owned entity-reference routes configured by `ExplorerProvider basePath`.
- [x] Extract the descriptor-only event browser with package-owned selection state and URL updates.
- [x] Extract the descriptor-only overview dashboard with package-owned route links.
- [x] Extract the operations browser while keeping host operation execution behind an explicit execute-panel seam.
- [x] Extract the entity browser while keeping entity data loading, Mermaid rendering, and operation execution host-provided.
- [x] Extract the tasks browser while keeping task-run refresh/source loading host-provided.
- [x] Extract entity data browsing state/UI through a reflected entity data reader while keeping concrete BookOps loading host-local.
- [x] Extract operation execution parser/state through a reflected operation invoker while keeping host-specific execute panel controls local.
- [x] Extract the generic entity-ref input while keeping the BookOps chapter path/TOC picker local.
- [x] Extract the operation execute panel/form while keeping the BookOps chapter path/TOC picker as a narrow `renderRefInput` override.
- [x] Make operation detail/browser surfaces use the package-owned execute panel by default from reflected runtime capability.
- [x] Remove the obsolete BookOps execute-panel wrapper and keep only the host-specific ref-input renderer.
- [x] Extract schema description and generic Explorer snapshot/entity/task/operation descriptor building behind `@ontahi/explorer-react/server`.
- [x] Extract Supabase reflected entity data loading behind `@ontahi/supabase/data-graph`.
- [x] Extract Explorer collection routes, section navigation, and shared page shell while keeping Next.js pathname/theme/auth wiring host-local.
- [x] Mount the host shell once in the Next.js layout and remove repeated page-level shell composition.
- [x] Remove dead detail/overview/events compatibility surfaces and the BookOps `GraphOps*` contract alias layer.

## Out Of Scope

1. No whole-folder move from `graph-ops` to Explorer.
2. No route rename from `/internal/graph`.
3. No move of BookOps graph/task registry ownership or app event metadata out of BookOps.
4. No extraction of concrete operation bridge implementation, BookOps chapter path controls, service-role client creation, or task-run store/source implementations.
5. No GraphOS topology redesign.
