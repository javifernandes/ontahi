---
id: ontahi.alive-ui
kind: capability
title: Alive UI
parent: ontahi.application-architecture-surface
status: shaping
horizon: later
supports:
  - ontahi
  - ontahi.model.selection
  - ontahi.react-graph-surface
relatedPlans:
  - bookops://plans/76-operation-input-metadata-and-ui
  - ontahi://plans/117-alive-ui-from-reflected-selections
  - ontahi://plans/118-ontahi-selection-language-editor
  - ontahi://plans/126-ontahi-runtime-data-reflection
migratedFrom: bookops://atlas/application-architecture-surface/alive-ui
sourceCommit: 67713696
---

[[ontahi.alive-ui|Alive UI]] is a future headless interaction framework over Ontahi Entities,
Selections, and operations. It combines semantic contracts, [[ontahi.runtime-data-reflection|Runtime
Data Reflection]], and surface policy to choose viable interaction patterns without encoding
component names into the domain model.

Its durable output is an interaction plan plus state and behavior: enumerate, search, select,
validate, preview, and invoke. A small enumerable Ref target may become a radio list; a large
searchable population may become a typeahead; a comprehension target may open the Selection
language editor; an unknown or unsupported capability must produce an honest fallback.

React, Vue, terminals, Explorer, and other hosts can project the headless contract. An optional
Ontahi visual kit may provide defaults, but visual language, product policy, accessibility, and
explicit application overrides remain host responsibilities.
