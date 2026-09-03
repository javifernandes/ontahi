# 100i. Ontahi Observability Adapter Boundary

Status: done

Canonical ID: `ontahi://plans/100i-ontahi-observability-adapter-boundary`

Migrated from: `bookops://plans/100i-ontahi-observability-adapter-boundary`
Original path: `plans/done/100i-ontahi-observability-adapter-boundary.md`
Source commit: `cb9c038a`

Parent plan: [`100. Ontahi Framework Extraction`](../done/100-ontahi-framework-extraction.md)

Advances goal: [`Ontahi Independently Usable`](ontahi://atlas/independently-usable)

Shapes: [`Runtime Capability Model`](ontahi://atlas/application-architecture-surface/runtime-capabilities)

## Summary

Keep vendor-neutral telemetry and reporting ports in `@ontahi/core`, move the OpenTelemetry implementation into `@ontahi/opentelemetry`, and return the currently BookOps-only Sentry implementation to the BookOps host.

## Context

Core exposed useful observability ports, but it also owned OpenTelemetry and Sentry implementations. The OTel adapter used `bookops.*` span attributes and optional dynamic loading; Sentry knew vendor-specific scopes, DSNs, and reporting options. Axiom itself was not coupled to the framework: BookOps selects it through standard OTLP environment configuration.

## Scope

1. Keep `ServerRuntimeTelemetryAdapter`, `ServerRuntimeReportingAdapter`, no-op behavior, and runtime instrumentation in core.
2. Create `@ontahi/opentelemetry` with direct `@opentelemetry/api` integration and `ontahi.*` attributes.
3. Keep OTel SDK/exporter registration and resource configuration in the host.
4. Move Sentry reporting into BookOps until another host proves a reusable package.
5. Remove obsolete OTel and Sentry exports from core without compatibility shims.

## Non-Goals

1. No Axiom-specific adapter.
2. No trace attribute backward compatibility.
3. No broader redesign of reporting, logging, or runtime composition.

## Execution Slices

- [x] Extract and test `@ontahi/opentelemetry`.
- [x] Rewire BookOps telemetry and use host resource attributes for environment metadata.
- [x] Move Sentry reporting and its tests into BookOps.
- [x] Update package topology, docs, and the runtime capability model.

## Verification

- [x] Core builds and passes 277 tests without OpenTelemetry or Sentry implementation code.
- [x] The OTel package builds, typechecks, lints, and passes 9 adapter tests.
- [x] BookOps typecheck, 838 unit tests, and 319 Storybook tests pass.
- [x] The production Vercel build passes with Workflow discovery reporting 7 steps and 1 workflow.
- [x] Axiom/SigNoz remain host-selected through OTLP configuration.

## Closure / Evolution

The boundary landed without compatibility shims. `@ontahi/core` now owns only vendor-neutral observability ports and runtime calls; `@ontahi/opentelemetry` owns span adaptation and `ontahi.*` attributes; BookOps owns Sentry plus SDK/exporter composition.

Create a Sentry package only when a non-BookOps host needs the same adapter. Broader telemetry semantics remain part of the application composition work.
