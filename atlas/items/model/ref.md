---
id: ontahi.model.ref
kind: concept
title: Ref
parent: ontahi.model
status: active
horizon: now
supports:
  - ontahi.domain-topology-graphos
  - ontahi.operation-contracts
relatedPlans:
  - bookops://plans/77-domain-topology-and-graphos-layers
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/122-ontahi-developer-book
  - ontahi://plans/125-ontahi-reference-fields
  - ontahi://plans/74b-schema-native-operation-refs
migratedFrom: bookops://atlas/model/ref
sourceCommit: 67713696
---

A [[ontahi.model.ref|Ref]] is a value that references one particular instance of an
[[ontahi.model.entity|Entity]] without carrying its full payload. It can supply the member of a
singleton [[ontahi.model.selection|Selection]], but remains identity rather than a set.

Like a Promise describes a value whose materialization may be elsewhere or later, a Ref lets
application logic name an Entity instance without deciding whether its snapshot is currently in
memory, must be loaded, or can be handled only through its identity. The runtime owns those
execution and transport decisions.

When a public operation input requires a Selection and the caller supplies one Ref, Ontahi promotes
the Ref to a singleton Selection before the operation implementation runs. Callers therefore pass
`TodoList.refById(id)` directly without importing Selection construction machinery.

For the common Entity shape, `id: field.id()` creates that `refById` factory automatically. More
locators can be declared without restating the conventional identity; composite and alternate
identities remain explicit.

Refs are where routing, authorization, graph selection, cache invalidation, and operation inputs start to share the same vocabulary.

A Reference Field extends that vocabulary into materialized Entity values. Instead of degrading a
relationship to an unrelated `bookId: string`, `field.ref(Book)` preserves that the value points to
a Book while a storage adapter decides how to encode its locator.

The same declaration is sufficient in a Domain Operation input. The implementation receives the
Ref at its declared field path, enriched on a fresh runtime copy with non-enumerable `resolve()`,
`invalidate()`, and `refresh()` methods. The caller's Ref and its JSON form remain only
`kind`, `entityName`, and `locator`.

`resolve()` executes the default authorized Entity Query and reuses its result inside the current
[[ontahi.model.unit-of-work|Unit Of Work]]. `invalidate()` evicts that Ref locally; `refresh()` is
invalidate followed by resolve. A schema node can opt into a different projection or semantic
lookup with `graphSchema.ref(Entity).resolveWith(resolver)`. The resolver remains runtime metadata;
reflection and transport expose the target Entity and locators, never the callback.
