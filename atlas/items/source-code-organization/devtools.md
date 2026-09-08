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
  - ontahi://plans/145-ordered-relations-and-sequence-commands
  - ontahi://plans/148-ontahi-devtools-runtime-inspection
  - ontahi://plans/150-ontahi-devtools-semantic-console
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
4. **Settings:** effective configuration and development overrides derived generically from an
   explicitly provided configurable Runtime Transport.
5. **Console:** reflection-assisted authoring and explicit execution of Graph Reads, Graph Commands,
   and Operation invocations through the application's ordinary runtime capabilities, with results
   correlated back to Activity.

## Component Boundary

The diagnostic model should be headless and observable without the visual component. A
transport-neutral decorator can record `RuntimeTransport.request(...)` and Durable observation
lifecycle, while individual transports contribute optional HTTP, WebSocket, handshake, and
connection evidence. The existing Graph Client Cache inspection and subscription boundary supplies
cache state and events.

The Console extends that headless boundary with source/history and execution coordination while
leaving parsing and lowering in the semantic language capability. The host supplies a narrow
application model and ordinary Read, Command, and Operation execution ports. The Devtools package
does not import Explorer UI contracts, a storage provider, or a server runtime; its React export
only projects the headless Console session.

The headless diagnostic store and transport decorator live in `@ontahi/devtools`. The bottom-docked
React surface is exported separately from `@ontahi/devtools/react`; it is one projection of that
model, not the source of runtime truth. This keeps visual tooling and dependencies outside the
non-visual `@ontahi/react` client. The shipped surface covers correlated Activity with inline
Operation progress and a runtime-owned Settings projection; Cache and connection-state evidence
remain Plan 148 work.

Activity leads with reconstructed application intent, such as an Entity selection and named View,
or an Operation's input and returned value with Entity Refs reduced to domain identity. Protocol
family and transport remain secondary evidence. Its full-width, vertically resizable bottom drawer
keeps application context visible above while its master-detail layout keeps traffic at the left
and compares Request with Response at the right. Each side uses progressive disclosure from a
semantic projection to body JSON and finally the complete envelope; the raw transport package is
never the default explanation of application behavior.

Ordered Relationship Commands keep that same progression. Activity summarizes a move as
`Source.relation.move(member, before|after|at: anchor)`, while the Visual detail separates the
source/list, moving member, and destination. Body and Envelope remain the exact portable evidence;
Devtools does not synthesize UI drag events or observe presentation storage.

The Console's `exists()` terminal uses the application Graph Read's presence semantics: the
language lowers to a bounded nullable `get`, and the Console projects a successful record/null to
a Boolean. The submitted source determines that projection even if the draft changes in flight.
Read policies and failures are preserved; Activity retains the real exchange rather than a
synthetic Boolean protocol response. Ordering and display-limit modifiers do not apply to exists.

The Console's Visual many-result table is also a source-backed Query editing projection. A scalar
Field header edits `.orderBy(...)` through the headless language's source ranges and submits the
ordinary Graph Read; the runtime applies ordering before its limit. Text changes remain drafts
until explicitly executed. The table retains the last successful request/source/result snapshot,
so its sort indicator does not claim that an unfinished, pending, or rejected draft produced those
rows. Invalid or other-Entity drafts disable table actions. This first projection supports one
ordering Field; multi-Field ordering remains later work. Header availability
intersects reflected scalar types with optional ordering capabilities delivered by the successful
Graph Read. Core owns those policy-derived capabilities; Devtools projects them as enabled controls
or explanatory inactive headers, never as frontend policy. Missing metadata, replaced transport,
or a policy denial requires fresh successful execution before sorting. These are advisory snapshots,
not durable grants: authorization still runs on every submitted query.
Console ordering autocomplete consumes the same snapshot through a headless completion resolver.
It suggests only permitted reflected Fields for the matching Entity and transport, while manual
authoring and other completion contexts remain independent of that advisory capability.

The many-result limit control is another source-backed projection. Apply/Enter edits only the limit
through headless source ranges, then submits the current same-Entity draft. A compact result toolbar
shows last successful round-trip duration, editable limit and Visual/JSON without duplicating the
query or success/row summaries. Draft, pending and previous-result notices appear only when needed;
actionable errors remain visible. The retained result, duration and limit do not imply a total count
or pagination. UI draft numbers and source Undo never execute
implicitly, and the receiver still enforces maximum-limit policy.

Transport routing is likewise a reusable Core runtime component rather than state owned by the
Devtools panel or application. Devtools discovers and operates the `routing` capability of an
explicitly provided configurable Runtime Transport, subscribes to its snapshot, and derives both
selectors and preferred-transport profiles from registered capabilities. Routing changes affect new
work; an active Durable or Graph observation remains on the transport where it began. Unknown
families fail, unsupported assignments are rejected, and an ambiguous transmission never falls back
automatically through another transport.

## Safety And Scope

Diagnostics use bounded in-memory retention, avoid payload persistence by default, and provide
redaction before values enter the diagnostic store. Production inclusion and mutable controls are
explicit host choices. Console history restores source but never executes it automatically. A
Command or Operation submitted again is a new explicit effect, not a replay guarantee; automatic
retry, one-click mutation replay, and ambiguous-failure recovery remain outside the component until
Ontahí has truthful invocation identity and idempotency contracts.

Ontahí Devtools does not create a second protocol, change application hooks, own deployment
policy, or replace the browser's complete Network tooling. It realizes the runtime-inspection part
of [[ontahi.developer-experience|Ontahí Developer Experience]] by showing the semantic system the
browser tooling cannot know.
