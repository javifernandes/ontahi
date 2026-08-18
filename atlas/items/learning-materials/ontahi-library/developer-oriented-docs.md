---
id: ontahi.learning-materials.library.developer-docs
kind: capability
title: Ontahi for Developers
parent: ontahi.learning-materials.library
status: active
horizon: now
supports:
  - ontahi.learning-materials.library
  - ontahi
relatedPlans:
  - bookops://plans/100h-ontahi-portability-example-and-developer-guide
  - bookops://plans/122-ontahi-developer-book
migratedFrom: bookops://atlas/learning-materials/ontahi-library/developer-oriented-docs
sourceCommit: 67713696
---

Ontahi for Developers is the programming-facing book in the Ontahi Library, a sibling of Living
Systems. It teaches the framework directly through its canonical declarations, runtime boundaries,
and executable examples.

Its voice is concise, affirmative, and code-led. It explains Ontahi's own distinctions—Entity,
Ref, Selection, Relation, Query, Command, Domain Operation, Capability, Runtime, and
Application—without narrating the extraction history or comparing each concept with other
frameworks. The reader should encounter one recommended Ontahi form before advanced or
transitional surfaces.

The independent Todo Express application is the executable spine and BookOps is the production
pressure test. The first-edition inventory classified the actual exported and used surface as
`canonical`, `advanced`, or `transitional`; only canonical APIs define the main path.
Reference appendices may expose advanced APIs, while transitional compatibility surfaces remain
outside the teaching language.

The first edition ends with an explicitly directional fifth part. An opening map names the whole
horizon, then each direction receives one concise chapter, stable route, and compact architectural
diagram. The part presents AI Operations as the visible path over model-backed execution, separates
Runtime Data Reflection from the headless Alive UI it enables, grounds the Selection language
editor in durable Atlas research, and maps events, streaming, operational policy, graph
segmentation, adapters, and Living Entities without turning future work into current framework
promises.

The first edition is complete and publication-verified: 27 chapters in five parts move from a
minimal application through Entity, identity, Relations, Selections, Queries, Commands, Operations,
runtimes, reflection, browser projection, and the future map. The book evolves with real public API
changes, but v1 documentation is no longer an open framework-extraction gate.

The repository-level [`Application data access`](../../../../docs/application-data-access.md) guide
is the concise, release-adjacent entrypoint for the current public API. It presents Queries as the
ordinary read path, caller-owned Views as materialization, Operations as domain behavior, and
default-deny server policy as the remote boundary. The longer book can teach the same distinctions
in depth without becoming the only place a package consumer can discover the supported path.
