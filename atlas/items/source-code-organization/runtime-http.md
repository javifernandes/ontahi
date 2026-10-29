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
particular application. Its first adapter lowers Core's transport-neutral managed Event egress
attempt to one Fetch request.

The adapter serializes the projected body once, signs those exact bytes when configured, sends
stable semantic and idempotency headers, enforces a bounded timeout, refuses URL credentials and
non-HTTP protocols, and does not follow redirects. It classifies accepted and retryable outcomes
without performing hidden retries. Terminal HTTP rejection remains a Core/host policy question, so
the adapter fails closed rather than acknowledging a delivery or inventing dead-letter semantics.

Destination admission, secret resolution, subscription registration, durable claims, worker
scheduling, and attempt retention remain outside this package. Framework-specific packages may
provide several adapters, but they should reuse this generic HTTP concern rather than duplicate it.
