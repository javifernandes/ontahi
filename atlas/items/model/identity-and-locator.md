---
id: ontahi.model.identity-and-locator
kind: concept
title: Identity And Locator
parent: ontahi.model.entity
status: active
horizon: now
supports:
  - ontahi.model.entity
  - ontahi.model.ref
  - ontahi.model.selection
relatedPlans:
  - bookops://plans/74-entity-refs-and-unit-of-work
  - bookops://plans/79-graph-native-schema-dsl
  - ontahi://plans/116-ontahi-selection-model
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/model/identity-and-locator
sourceCommit: 67713696
---

[[ontahi.model.identity-and-locator|Identity]] says what makes two observations refer to the same
Entity instance across reads, operations, processes, and time. A Locator names one valid way to
express that identity.

The conventional declaration `id: field.id()` creates `refById` and makes it the default identity.
Alternate locators such as `refBySlug`, composite identities, and non-conventional primary fields
remain explicit.

A Locator produces a [[ontahi.model.ref|Ref]]. It does not fetch the Entity. The runtime can use the
same identity to normalize snapshots, hydrate operation inputs, lower reference fields, route work,
or turn a Ref into the member of a singleton [[ontahi.model.selection|Selection]].
