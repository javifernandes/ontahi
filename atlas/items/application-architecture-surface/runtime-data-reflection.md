---
id: ontahi.runtime-data-reflection
kind: system-primitive
title: Runtime Data Reflection
parent: ontahi.application-architecture-surface
status: shaping
horizon: later
supports:
  - ontahi.alive-ui
  - ontahi.source-code-organization.explorer-react
  - ontahi.model.selection
relatedPlans:
  - bookops://plans/91-reflective-architecture-admin-ui
  - bookops://plans/117-alive-ui-from-reflected-selections
  - bookops://plans/126-ontahi-runtime-data-reflection
migratedFrom: bookops://atlas/application-architecture-surface/runtime-data-reflection
sourceCommit: 67713696
---

[[ontahi.runtime-data-reflection|Runtime Data Reflection]] describes dynamic, authority-aware facts
about the live data behind an Entity or [[ontahi.model.selection|Selection]]. It complements static
application reflection with population, exactness, freshness, cost, and supported evaluation
capabilities.

A storage adapter is often the primary evidence source, but the semantic contract belongs to the
runtime. Search indexes, caches, projections, remote graph segments, and other providers may offer
different enumeration, search, filtering, sorting, sampling, aggregation, or pagination
capabilities.

The current `ReflectedEntityDataReader` is a narrow proof of this shape. In-memory, PostgreSQL, and
Supabase runtimes can already expose searchable, filterable, sortable, paginated Entity data with
an exact `totalCount`. The future profile makes capability, approximation quality, limits,
freshness, and expected cost explicit instead of asking each consumer to infer them from a
successful request.

Runtime data profiles are facts, not UI hints. [[ontahi.alive-ui|Alive UI]], Explorer, analytics,
charts, and tools may interpret the same profile differently. Counts and distributions must obey
authority because summaries can leak facts even when rows remain hidden.
