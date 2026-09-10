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
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/150a-selection-factories-locators-and-refs
migratedFrom: bookops://atlas/model/identity-and-locator
sourceCommit: 67713696
---

[[ontahi.model.identity-and-locator|Identity]] says what makes two observations refer to the same
Entity instance across reads, operations, processes, and time. The model distinguishes one
canonical identity, possibly composite, from alternative criteria for finding an Entity. A Locator
names a declared lookup construction; an alternate lookup is not another canonical identity.

The conventional declaration `id: field.id()` creates `refById` and makes it the default identity.
Alternate locators such as `refBySlug`, composite identities, and non-conventional primary fields
remain explicit.

A Locator produces a [[ontahi.model.ref|Ref]]. It does not fetch the Entity. The runtime can use the
same identity to normalize snapshots, hydrate operation inputs, lower reference fields, route work,
or turn a Ref into the member of a singleton [[ontahi.model.selection|Selection]].

The current implementation selects canonical identity through `identityLocatorName` and can also
construct alias-shaped Refs from other locators. Cached snapshots are keyed by canonical identity;
aliases are learned associations that can change or require invalidation. Two different Ref values
are not known to identify the same row without authoritative resolution or an established cache
association. Constructing a Ref is not an existence or uniqueness check.

Plan 150a experimentally distinguishes these responsibilities and proposes pure named Selection
factories for lookup authoring, while preserving canonical identity and compatibility with existing
Refs. That direction is accepted with implementation/migration deferred: no locator API or portable Ref format has been removed. Current
schema types may omit identity, but a snapshot without sufficient canonical identity data cannot be
normalized into the Entity cache. Composite cache identity also does not imply that every Reference
Field storage projection supports composite targets.
