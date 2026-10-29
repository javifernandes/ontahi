---
id: ontahi.source-code-organization.runtime-http
kind: artifact
title: @ontahi/runtime-http
parent: ontahi.source-code-organization
status: in-progress
horizon: now
supports:
  - ontahi.model.event
relatedPlans:
  - ontahi://plans/146m-managed-http-event-egress
---

`@ontahi/runtime-http` owns reusable HTTP mechanics that are independent of Express, Next.js, or a
particular application. It exposes separate ingress, Node host, and managed Event egress
entrypoints so consumers do not acquire a framework-specific or server-only boundary accidentally.

Its ingress handler composes Core's provider-authenticated Operation and Event routers behind a
standard Web `Request → Response` contract. Express and Next.js delegate to that handler. The
optional `node:http` bridge proves that an Ontahí application can host the same semantic ingress
without either framework; it owns only bounded body conversion, Web response projection, and safe
unexpected-failure handling. Listening topology, TLS, shutdown, proxy trust, and authorization
remain host responsibilities.

The egress adapter serializes the projected body once, signs those exact bytes when configured, sends
stable semantic and idempotency headers, enforces a bounded timeout, refuses URL credentials and
non-HTTP protocols, and does not follow redirects. It classifies accepted and retryable outcomes
without performing hidden retries. Terminal HTTP rejection remains a Core/host policy question, so
the adapter fails closed rather than acknowledging a delivery or inventing dead-letter semantics.

Destination admission, secret resolution, subscription registration, durable claims, worker
scheduling, and attempt retention remain outside this package. Framework-specific packages may
provide several affordances and lifecycle integrations, but they reuse this generic HTTP concern
rather than duplicate its semantic routing.
