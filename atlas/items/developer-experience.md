---
id: ontahi.developer-experience
kind: experience
title: Ontahí Developer Experience
parent: ontahi
status: idea
horizon: next
supports:
  - ontahi
relatedPlans:
  - ontahi://plans/100h-ontahi-portability-example-and-developer-guide
  - ontahi://plans/122-ontahi-developer-book
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/146-ontahi-runtime-protocol
  - ontahi://plans/146h-websocket-runtime-transport-and-durable-progress
  - ontahi://plans/148-ontahi-devtools-runtime-inspection
  - ontahi://plans/118-ontahi-selection-language-editor
---

Ontahí Developer Experience is the experience of building, understanding, inspecting, and
debugging an Ontahí application through the framework's semantic language rather than reconstructing
that meaning from framework, browser, and infrastructure internals.

A developer should be able to see what the application asked Ontahí to do, how the runtime
interpreted it, where it executed, which transport carried it, what result or rejection came back,
and how client state changed. HTTP requests, WebSocket frames, polling, and pushed progress remain
important evidence, but they are projections of Operations, Graph Reads, Graph Commands, Durable
Operation observations, cache activity, and future protocol families.

The experience should support at least:

1. following one semantic activity across request, response, progress, and client-state effects;
2. distinguishing protocol rejection, transport failure, application failure, cancellation, and
   malformed or incompatible messages;
3. understanding effective Runtime Protocol capabilities and transport routing without inspecting
   application wiring;
4. comparing HTTP, WebSocket, and mixed routing while preserving the same application authoring;
5. inspecting Ontahí's normalized client cache, aliases, outputs, and invalidations;
6. moving from a concise semantic explanation to the exact portable envelopes and
   transport-specific evidence when deeper diagnosis is needed;
7. keeping authority, credentials, and sensitive payloads protected while diagnostics are active.

Configuration is part of the experience when it helps a developer understand or test a runtime,
but application deployment policy remains host-owned. Diagnostic surfaces should always show the
effective configuration and may operate the inspectable routing capability of a configurable
Runtime Transport. Applications compose initial routing but do not reimplement the settings model,
controls, synchronization, or presets. Changes apply only according to the configured transport
contract: they must not imply automatic cross-transport retry, replay of effects, or migration of
active Durable or Graph observations.

This Experience is not one package or screen. Plans can improve one or more parts of it, and
multiple implementation components can realize it.
[[ontahi.source-code-organization.devtools|Ontahí Devtools]] is the first proposed component focused
on runtime inspection and transport tuning; Explorer, documentation, examples, diagnostics, and
the [[ontahi.semantic-interaction-language|Ontahí Semantic Interaction Language]] support adjacent
parts without being collapsed into Devtools. Devtools may project the same canonical Selection or
Graph Read that a language surface produces, while document parsing and semantic resolution remain
owned by the language capability.
