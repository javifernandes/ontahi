# 124. Ontahi Capability Dependency Contracts

Status: next

Canonical ID: `ontahi://plans/124-ontahi-capability-dependency-contracts`

Migrated from: `bookops://plans/124-ontahi-capability-dependency-contracts`
Original path: `plans/next/124-ontahi-capability-dependency-contracts.md`
Source commit: `cb9c038a`

Source plan: [`122. Ontahi Developer Book`](../done/122-ontahi-developer-book.md)

## Summary

Turn Entity Capability use from a TypeScript witness into a declarative dependency contract that
Ontahí can validate at application composition and expose through safe reflection, without
freezing today's arbitrary resource injection as the final semantic model.

## Context

The developer book's Capability chapter uses the current canonical pattern:

```ts
uses: {
  capabilities: {} as TodoCapabilities,
}
```

This types the operation's `app` context, while `ontahi({ capabilities })` supplies the concrete
implementation. It does not currently give the runtime a dependency value it can inspect. A host
may omit a required path and discover that only when an operation accesses it.

The dependency is real and useful; its declaration should not depend on an opaque cast.

The entire current surface is draft and low-level: `capabilities` injects typed resources under
host-owned object paths. That flexibility admits sync functions, async services, Effect programs,
and arbitrary objects, but Ontahí cannot distinguish a notification contract from a current-user
resolver or another function-shaped resource. If this mechanism becomes the final abstraction,
recurring concepts remain opaque instead of becoming reflectable application semantics.

Effect is Ontahí's uniform internal computation, not a required provider-authoring style. The
transitional `adaptEffectMethods(...)` boundary now lets a method resource be implemented with
plain functions, Promises, or Effects while operations consume one lazy Effect contract.

## Scope

1. Define a graph-native or application-native Capability requirement declaration.
2. Preserve nested host-owned namespaces and precise TypeScript inference.
3. Validate required Capability paths when `ontahi(...)` composes the application.
4. Report missing or incompatible bindings before any operation can run.
5. Reflect public contract names and shapes without exposing implementations, credentials, or
   provider configuration.
6. Keep generated browser projections limited to operations; server Capabilities must not leak into
   client bundles.
7. Migrate the Todo notification Capability and representative BookOps Entities.
8. Distinguish low-level host resources from recurring concepts that deserve first-class semantic
   declarations.

## Non-Goals

1. Defining one universal vocabulary for mail, auth, search, notifications, or external services.
2. Building a general-purpose dependency injection container.
3. Serializing Capability implementations.
4. Making graph storage or task runtimes ordinary Entity Capabilities.

## Desired Properties

- An Entity states what it needs without `{} as SomeCapabilities`.
- The application root remains the only place that selects implementations.
- Missing bindings fail during composition with the Entity name and Capability path.
- Reflection can explain dependencies but cannot reveal executable code or secrets.
- Node and browser callers continue to invoke only the operation.
- Hosts can implement a required effect with an ordinary sync function, async function, or Effect;
  normalization happens once at the binding boundary.

## Execution Slices

- [ ] Inventory current `uses.capabilities` shapes and application namespaces.
- [x] Remove per-method `Effect.sync(...)` ceremony from the Todo provider with one lazy host-edge
      adapter that accepts sync, async, and Effect implementations.
- [ ] Decide declaration spelling and nested-path behavior.
- [ ] Classify which current resources should remain low-level injection and which should become
      first-class semantic concepts.
- [ ] Add composition-time validation and focused diagnostics.
- [ ] Add safe reflection metadata.
- [ ] Migrate Todo and representative BookOps usages.
- [ ] Add typing, runtime, reflection, and codegen-boundary tests.

## Decisions

1. Capability names remain application vocabulary.
2. The host owns implementations; Entities own dependency declarations.
3. Browser projections may expose that an operation exists, never its server Capability binding.
4. Effect remains an internal uniform computation; host providers are not required to author every
   method with Effect APIs.
5. The generic resource bag is an implementation mechanism, not automatically the final ontology
   of application Capabilities.

## Open Questions

1. Should operations receive a narrowed `capabilities` value directly, or continue through `app`?
2. Should requirements describe only paths, or also carry portable input/output schemas?
3. Which recurring resource kinds should Ontahí reify so reflection and tooling can understand
   more than an injected function signature?
