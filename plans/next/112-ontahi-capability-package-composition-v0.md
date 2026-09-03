# 112. Ontahi Capability Package Composition v0

Status: next

Canonical ID: `ontahi://plans/112-ontahi-capability-package-composition-v0`

Migrated from: `bookops://plans/112-ontahi-capability-package-composition-v0`
Original path: `plans/next/112-ontahi-capability-package-composition-v0.md`
Source commit: `77e89e2d`

Definition level: outlined

Parent plan: [111. Atlas As An Ontahi Application](bookops://plans/111-atlas-as-ontahi-application)

## Summary

Define a simple way for an Ontahi application to consume reusable capability packages.

The first version should stay practical: plain workspace or npm packages that export model declarations, operations, optional UI bindings, and adapter hooks. This is the missing bridge between "Atlas is made with Ontahi" and "Atlas can reuse capabilities originally built in BookOps."

## Context

BookOps already contains product functionality that is bigger than BookOps:

1. anchored conversations,
2. reactions,
3. mentions,
4. markdown/content editing,
5. authoring workflows,
6. operation-driven reader actions.

Atlas wants some of those same capabilities. Reimplementing them directly inside Atlas would make Ontahi less real. Extracting everything into a grand plugin system would be premature.

The v0 should answer the boring but powerful question: what does an Ontahi app import when it wants a reusable capability?

## Scope

Define a v0 package composition convention.

The work should:

1. name what a capability package can export,
2. define how an app registers or mounts the package,
3. keep app-specific storage and authorization explicit,
4. allow UI bindings without making them mandatory,
5. support gradual extraction from BookOps into Ontahi packages.

## Non-Goals

1. Do not build a marketplace.
2. Do not define remote package installation.
3. Do not require a new runtime server.
4. Do not force every capability to ship UI.
5. Do not solve multi-tenant package isolation yet.

## Proposed Form

A v0 capability package can expose:

```txt
Ontahi capability package
  model
    entities
    relations
    states
    invariants
  operations
    commands
    queries
    policies
  adapters
    storage binding
    auth binding
    event binding
  ui
    optional React components
    optional route/detail/action bindings
  evidence
    tests
    stories
    fixtures
    docs
```

The consuming app stays responsible for:

1. choosing storage,
2. mapping actors and authority,
3. deciding which UI surfaces are visible,
4. wiring app-specific routes and permissions.

## Execution Slices

1. Read one current Ontahi package boundary and one BookOps capability boundary.
2. Draft a minimal `defineCapabilityPackage` shape.
3. Try the shape on a tiny fake capability before extracting real code.
4. Decide how package operations are registered into an app facade.
5. Document which parts are compile-time declarations and which parts are runtime bindings.
6. Use conversations as the first serious extraction candidate.

## Verification

- [ ] A small app can import a capability package without depending on BookOps.
- [ ] The app can choose storage and authorization bindings explicitly.
- [ ] The package can expose operations without forcing a UI dependency.
- [ ] The package can expose optional React bindings when the app wants them.
- [ ] The shape is enough to plan conversation extraction.

## Decisions

1. Start with plain TypeScript packages and explicit app registration.
2. Treat packages as capability bundles, not opaque plugins.
3. Keep app authority outside the reusable package until Ontahi has a stronger policy model.
4. Make UI optional.

## Child Plans

1. [113. BookOps Conversations Capability Extraction](bookops://plans/113-bookops-conversations-capability-extraction)

## Open Questions

1. Should package manifests be code-first, markdown-described, or both?
2. How should database migrations travel with a capability package?
3. Can storybook stories become part of package evidence?
4. How much package metadata should Atlas understand directly?

## Closure / Evolution

Not started. This plan is the practical composition layer that makes reusable Ontahi capabilities plausible.
