---
id: ontahi.source-code-organization.devtools
kind: artifact
title: Ontahí Devtools
parent: ontahi.source-code-organization
status: active
horizon: now
supports:
  - ontahi.developer-experience
  - ontahi.runtime-protocol
  - ontahi.react-graph-surface
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/146-ontahi-runtime-protocol
  - ontahi://plans/146e-runtime-transport-durable-observation
  - ontahi://plans/146h-websocket-runtime-transport-and-durable-progress
  - ontahi://plans/148-ontahi-devtools-runtime-inspection
---

Ontahí Devtools is the browser-resident implementation component for inspecting an Ontahí web
client. The familiar name follows Redux DevTools and TanStack Query Devtools: it is immediately
recognizable as development tooling while remaining specific to Ontahí semantics.

The component presents one semantic activity stream across HTTP, WebSocket, and future Runtime
Transports. It interprets strict Runtime Protocol envelopes instead of asking a developer to infer
meaning from browser Network entries or raw WebSocket frames. An Operation invocation, Graph Read,
Graph Command, Durable observation, protocol error, and transport failure retain their distinct
meaning even when they share a connection or visual timeline.

## Intended Surfaces

1. **Activity:** correlated Runtime Protocol exchanges with family, intent, transport, duration,
   status, concise semantic interpretation, expandable portable envelopes, and inline Operation
   progress timelines with Task/run identity and ordered snapshots.
2. **Cache:** normalized Entity records, aliases, cached outputs, writes, and invalidations from the
   Ontahí Graph Client Cache. It complements rather than reproduces generic React Query tooling.
3. **Transport:** effective routing, connection lifecycle, handshake, negotiated capabilities,
   endpoint projection, protocol/session diagnostics, and HTTP or WebSocket evidence.
4. **Settings:** read-only effective configuration plus optional development overrides supplied by
   a host-owned transport-routing controller.

## Component Boundary

The diagnostic model should be headless and observable without the visual component. A
transport-neutral decorator can record `RuntimeTransport.request(...)` and Durable observation
lifecycle, while individual transports contribute optional HTTP, WebSocket, handshake, and
connection evidence. The existing Graph Client Cache inspection and subscription boundary supplies
cache state and events.

The headless diagnostic store and transport decorator live in `@ontahi/devtools`. The bottom-docked
React surface is exported separately from `@ontahi/devtools/react`; it is one projection of that
model, not the source of runtime truth. This keeps visual tooling and dependencies outside the
non-visual `@ontahi/react` client. The shipped surface covers correlated Activity with inline
Operation progress and an optional host-owned Settings projection; Cache and connection-state
evidence remain Plan 148 work.

Activity leads with reconstructed application intent, such as an Entity selection and named View,
or an Operation's input and returned value with Entity Refs reduced to domain identity. Protocol
family and transport remain secondary evidence. Its full-width, vertically resizable bottom drawer
keeps application context visible above while its master-detail layout keeps traffic at the left
and compares Request with Response at the right. Each side uses progressive disclosure from a
semantic projection to body JSON and finally the complete envelope; the raw transport package is
never the default explanation of application behavior.

Transport routing is likewise a reusable runtime component rather than state owned by the Devtools
panel. Devtools may discover and operate an explicitly provided controller. Routing changes affect
new work; an active Durable observation remains on the transport where it began. Unknown families
must fail or use an explicit default, and an ambiguous transmission never falls back automatically
through another transport.

## Safety And Scope

Diagnostics use bounded in-memory retention, avoid payload persistence by default, and provide
redaction before values enter the diagnostic store. Production inclusion and mutable controls are
explicit host choices. Replaying Commands or Operations is outside the first component because it
could duplicate effects before Ontahí has a truthful invocation identity and idempotency contract.

Ontahí Devtools does not create a second protocol, change application hooks, own deployment
policy, or replace the browser's complete Network tooling. It realizes the runtime-inspection part
of [[ontahi.developer-experience|Ontahí Developer Experience]] by showing the semantic system the
browser tooling cannot know.
