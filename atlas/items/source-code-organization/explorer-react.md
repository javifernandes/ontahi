---
id: ontahi.source-code-organization.explorer-react
kind: artifact
title: @ontahi/explorer-react
parent: ontahi.source-code-organization
status: in-progress
horizon: now
supports:
  - ontahi.domain-topology-graphos
relatedPlans:
  - bookops://plans/100-ontahi-framework-extraction
  - bookops://plans/100c-ontahi-explorer-react-boundary
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/118-ontahi-selection-language-editor
  - bookops://plans/117-alive-ui-from-reflected-selections
  - bookops://plans/126-ontahi-runtime-data-reflection
migratedFrom: bookops://atlas/source-code-organization/explorer-react
sourceCommit: 67713696
---

`@ontahi/explorer-react` is the reusable React UI package for Ontahi Explorer.

Ontahi Explorer is the product-facing surface for inspecting Ontahi systems: entities, operations, tasks, events, contracts, topology, authority, runtime, resources, and framework metadata.

The emerging [[ontahi.model.selection|Selection]] model gives Explorer a shared semantic foundation for entity Data filters, saved selections, operation-target previews, statistics, widgets, and dashboards. A future Selection language editor should edit the canonical Selection AST directly so table filters, visual composition, textual representations, and runtime execution do not become separate query languages. The editor is a reusable language artifact embedded by Explorer, not necessarily a React implementation owned by this package.

GraphOS remains useful as the conceptual/model vocabulary for the domain topology and layered graph. The package name should not be `@ontahi/ui-react` because that is too broad; it should name the actual framework surface being extracted.

BookOps remains the host application that supplies the Explorer mount path, access control, descriptor assembly, operation invocation transport, app-specific data loading, task-run refresh/source loading, Mermaid rendering, and app-specific ref-input enrichments.

Boundary inventory:

1. the package exposes neutral `Explorer*` descriptor/data/task-run contracts,
2. descriptor assembly from BookOps registries and stores remains in BookOps,
3. `/internal/graph` routes, auth, and server actions remain in BookOps,
4. reusable UI clusters now include display-name, operation-signature, field-row, schema-fields, schema-status, collapsible-section, JSON editor, theme provider, schema-panel, operation-metadata, operation-ingress, operation-detail, operation-executor helpers, operation-execute-panel, entity-ref input, task-detail, entity-structure, entity-operations-panel, entity-browser, entity-data-browser, entity-data-panel, event-detail, event-browser, overview, operations-browser, and tasks-browser components,
5. Explorer owns Monaco directly; embedded hosts integrate through light/dark/system theme configuration rather than an editor adapter,
6. entity references are package-owned plain anchors generated from Explorer routes; embedded hosts configure the mount `basePath`, not the route shape,
7. BookOps imports pure Explorer UI components directly and keeps only bridges or wrappers that still perform host work,
8. the operations and entity browsers are package-owned, and ordinary operation execution is package-owned through the reflected operation invoker plus reflected entity data hooks; BookOps passes only `renderGraphOpsOperationRefInput` from `graph-ops-operation-ref-input.tsx` for the host-specific chapter path/TOC picker,
9. the entity browser renders a package-owned Data tab when `@ontahi/react/graph` has a reflected entity data reader; BookOps currently supplies a temporary reader adapter around its existing server action,
10. reflected operation execution goes through `@ontahi/react/graph` with a host-supplied operation invoker, so Explorer-owned operation execution code can call operations by descriptor-discovered `operationId + input`,
11. the entity browser receives a host diagram renderer because Mermaid rendering remains an app concern,
12. the tasks browser receives host task-run refresh and source loaders because access checks and task-run stores remain app concerns,
13. remaining BookOps GraphOps components should be shells, host adapters, host-specific controls, or compatibility bridges rather than reusable Explorer UI.

Future selection-driven surfaces are directional rather than part of the current extraction boundary: saved-filter persistence, projectional selection editing, aggregate widgets, and dashboards should follow the Selection model instead of being designed as isolated Explorer features.

Explorer's current reflected Entity data reader is also implementation evidence for
[[ontahi.runtime-data-reflection|Runtime Data Reflection]]. Future adaptive inputs should consume
that provider-neutral profile through [[ontahi.alive-ui|Alive UI]] rather than infer population and
search viability from Explorer components.
