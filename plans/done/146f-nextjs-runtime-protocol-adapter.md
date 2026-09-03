# 146f. Next.js Runtime Protocol Adapter

Status: done

Parent plan: [146. Ontahí Runtime Protocol](../current/146-ontahi-runtime-protocol.md)

Predecessor:
[146e. Runtime Transport Durable Observation](../done/146e-runtime-transport-durable-observation.md)

Canonical ID: `ontahi://plans/146f-nextjs-runtime-protocol-adapter`

## Summary

Project the transport-neutral Ontahí Runtime Protocol dispatcher through a Next.js App Router
Route Handler. The adapter accepts a Web `Request`, validates the common envelope and canonical
family body before deriving receiver context, dispatches only through the injected dispatcher, and
returns a Web `Response` with the HTTP status semantics already established by Runtime Express.

```ts
import { createNextRuntimeProtocolRouteHandler } from '@ontahi/runtime-nextjs/runtime-protocol';

export const POST = createNextRuntimeProtocolRouteHandler({
  dispatcher,
  context: async request => ({
    principal: await resolvePrincipal(request),
  }),
});
```

This is a framework projection, not another execution boundary. It installs no family handlers,
authorization, policies, or capabilities and contains no family-specific dispatch switch.

## Current Evidence

1. Core publishes one strict registry and one transport-neutral dispatcher for `operation`,
   `durable.operation`, `graph.read`, and `graph.command`.
2. Runtime Express projects an injected dispatcher at `POST /runtime`, validates before deriving
   trusted context, and maps common protocol diagnostics to stable HTTP statuses.
3. Runtime Next.js exposes separate App Router adapters for legacy Operation invocation and Graph
   Read bodies, but no generic Runtime Protocol projection.
4. The Fetch Runtime Transport already sends `durable.operation.inspect` envelopes to `/runtime`,
   so Next.js hosts otherwise need application-local Route Handler glue.
5. Atlas host evidence demonstrates the missing adapter, but its local route logic is evidence for
   this small abstraction rather than implementation to copy.

## Scope

1. Add `createNextRuntimeProtocolRouteHandler` over Web `Request` and `Response`.
2. Parse JSON and validate the common envelope plus canonical family body before invoking the
   context factory or dispatcher.
3. Pass only receiver-owned context derived from the server `Request` beside the portable request.
4. Preserve the dispatcher result, family semantics, request id, family correlation, and common
   protocol diagnostics without reinterpretation.
5. Match Runtime Express HTTP status semantics: invalid requests `400`, unavailable families
   `501`, unavailable dispatch `503`, invalid upstream responses `502`, and semantic family
   responses `200`.
6. Report unexpected context or adapter failures through an optional host callback and return a
   safe correlated `dispatch_unavailable` error.
7. Publish the adapter at `@ontahi/runtime-nextjs/runtime-protocol` and document host ownership.
8. Add a Runtime Next.js Changeset and update Plan 146, Atlas, and developer documentation.

## Non-Goals

1. No automatic handler, capability, authorization, Query compilation, Graph Command policy, or
   Durable observation policy.
2. No migration of the Operation, Graph Read, Graph Command, or Durable Fetch clients in this
   slice.
3. No removal of `/operations`, `/graph/reads`, `/graph/commands`, or legacy Task snapshot paths.
4. No WebSocket, NATS, SSE, gRPC, Event, subscription, retry, or capability-negotiation design.
5. No changes to the transport-neutral Core dispatcher or existing family semantics.
6. No Atlas-specific API or copied application route implementation.

## TDD Slices

1. Add failing adapter tests for malformed JSON/envelopes, unknown versions, and validation before
   context derivation.
2. Add failing tests for valid dispatch, receiver-derived context, semantic family results, common
   protocol errors, known-but-unavailable families, and exact correlation.
3. Implement the smallest Web Request/Response projection that makes those contracts pass.
4. Add the package export, public documentation, Changeset, and artifact-boundary proof.

## Acceptance Checklist

- [x] A valid Runtime Protocol request reaches the injected dispatcher and returns `200`.
- [x] Invalid JSON, invalid envelopes, and unknown envelope or family-body versions fail before
      context derivation and dispatch.
- [x] A registered family without an installed handler returns correlated `family_unavailable`
      with `501`.
- [x] Trusted context is derived exclusively from the received server `Request` and passed beside
      the portable family body.
- [x] Semantic family results and family protocol errors remain intact inside a `200` correlated
      response envelope.
- [x] Common protocol errors retain their complete body and Runtime Express HTTP status mapping.
- [x] Request id and family correlation are unchanged in successful and error responses.
- [x] The adapter routes every canonical registered family through the dispatcher without a
      Next.js family switch.
- [x] `@ontahi/runtime-nextjs/runtime-protocol` is present in source, declarations, package exports,
      and the packed artifact.
- [x] Focused/full Runtime Next.js tests, coverage, typecheck, lint, formatting, package build,
      Changeset status, and artifact verification pass.
- [x] Plan 146, Atlas, package README, and developer documentation describe the Next.js projection
      and its host-owned authority boundary.

## Follow-Up Boundary

After this adapter exists, Plan 146g should unify Fetch clients for `operation`, `graph.read`,
`graph.command`, and `durable.operation.inspect` behind `RuntimeTransport` and `/runtime`, while
keeping explicit compatibility configuration for `/operations`, `/graph/reads`, and
`/graph/commands` during migration.

## Delivery Evidence

1. `@ontahi/runtime-nextjs/runtime-protocol` publishes
   `createNextRuntimeProtocolRouteHandler`, its generic receiver-context factory, and its complete
   options type through matching JavaScript and declaration artifacts.
2. The adapter parses Web request JSON, validates with the canonical Runtime Protocol registry,
   and only then derives host context and calls the injected dispatcher. It installs no handler,
   policy, authority, or capability and has no family-specific routing branch.
3. Common diagnostics preserve the Runtime Express status contract; successful family bodies,
   semantic rejections, family protocol errors, and request/family correlation pass through
   unchanged. Unexpected context or adapter failures become a safe correlated
   `dispatch_unavailable` response and can be reported to the host.
4. TDD began with the missing module failure and finished with 17 focused adapter cases covering
   all four registered families. The new route reports 100% statements, branches, functions, and
   lines; the complete Runtime Next.js package passes 47 tests.
5. Runtime Next.js typecheck, lint, build, repository formatting, Changeset status, and clean-room
   artifact install/type/runtime verification pass. The package README, developer transport
   chapter, Atlas item, and parent plan record the new projection and ownership boundary.
6. [Plan 146g](./146g-unified-fetch-runtime-protocol-clients.md) completed migration of the
   remaining Fetch family clients and explicit legacy endpoint compatibility.
