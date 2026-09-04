---
id: ontahi.source-code-organization.devtools
kind: artifact
title: Ontahí Devtools
parent: ontahi.source-code-organization
status: idea
horizon: next
supports:
  - ontahi.developer-experience
  - ontahi.runtime-protocol
  - ontahi.react-graph-surface
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/146-ontahi-runtime-protocol
  - ontahi://plans/146e-runtime-transport-durable-observation
  - ontahi://plans/146h-websocket-runtime-transport-and-durable-progress
---

Ontahí Devtools is the proposed browser-resident implementation component for inspecting an
Ontahí web client. The familiar name follows Redux DevTools and TanStack Query Devtools: it should
be immediately recognizable as development tooling while remaining specific to Ontahí semantics.

The component presents one semantic activity stream across HTTP, WebSocket, and future Runtime
Transports. It interprets strict Runtime Protocol envelopes instead of asking a developer to infer
meaning from browser Network entries or raw WebSocket frames. An Operation invocation, Graph Read,
Graph Command, Durable observation, protocol error, and transport failure retain their distinct
meaning even when they share a connection or visual timeline.

## Intended Surfaces

1. **Activity:** correlated Runtime Protocol exchanges with family, intent, transport, duration,
   status, concise semantic interpretation, and expandable portable envelopes.
2. **Durable:** Task/run identity, ordered snapshots, progress, terminal state, push versus polling,
   observation cleanup, and disconnect behavior.
3. **Cache:** normalized Entity records, aliases, cached outputs, writes, and invalidations from the
   Ontahí Graph Client Cache. It complements rather than reproduces generic React Query tooling.
4. **Transport:** effective routing, connection lifecycle, handshake, negotiated capabilities,
   endpoint projection, protocol/session diagnostics, and HTTP or WebSocket evidence.
5. **Settings:** read-only effective configuration plus optional development overrides supplied by
   a host-owned transport-routing controller.

## Component Boundary

The diagnostic model should be headless and observable without the visual component. A
transport-neutral decorator can record `RuntimeTransport.request(...)` and Durable observation
lifecycle, while individual transports contribute optional HTTP, WebSocket, handshake, and
connection evidence. The existing Graph Client Cache inspection and subscription boundary supplies
cache state and events.

The floating React surface is one projection of that diagnostic model, not the source of runtime
truth. The exact package boundary remains a future implementation-plan decision; a dedicated
development-only React package is preferable to adding visual tooling and dependencies to the
non-visual `@ontahi/react` client.

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
