---
id: ontahi.source-code-organization.react
kind: artifact
title: @ontahi/react
parent: ontahi.source-code-organization
status: in-progress
horizon: now
supports:
  - ontahi.application-architecture-surface
  - ontahi.react-graph-surface
relatedPlans:
  - ontahi://plans/100a-ontahi-react-graph-provider-spike
  - ontahi://plans/100b-ontahi-react-graph-query-boundary
migratedFrom: bookops://atlas/source-code-organization/react
sourceCommit: 67713696
---

`@ontahi/react` is the non-visual React integration package for Ontahi applications.

It currently owns action execution hooks, React Query integration, operation bridge adapters, and the public `@ontahi/react/graph` provider/context/query/command hook surface.

The generic React graph executor contract lets `@ontahi/react/graph` own query and command hooks without owning BookOps runtime assembly, Supabase-specific options, or browser Effect execution details.

BookOps remains the host application that supplies concrete graph runtime assembly, generated graph declarations, operation declarations, and app-specific durable operation behavior.
