# 146b. Versioned Operation Protocol Family

Status: done

Parent plan: [146. Ontahí Runtime Protocol](./146-ontahi-runtime-protocol.md)

Predecessor:
[146a. Runtime Protocol Envelope And Family Registry](../done/146a-runtime-protocol-envelope-and-family-registry.md)

Canonical ID: `ontahi://plans/146b-versioned-operation-protocol-family`

## Summary

Give Operation invocation and permission checks one independently versioned Runtime Protocol
family without changing their application-facing API, current HTTP endpoints, or canonical server
dispatcher. The `operation` family carries the existing semantic discriminants plus body version
1:

```json
{
  "protocol": "ontahi.runtime",
  "version": 1,
  "id": "request-123",
  "kind": "request",
  "family": "operation",
  "body": {
    "version": 1,
    "kind": "invoke",
    "operationId": "Student.transfer",
    "input": {}
  }
}
```

Do not add a second `action` discriminator. `kind: "invoke" | "check-permission"` already names
the two Operation requests and is understood by the existing dispatcher. The versioned request is
structurally compatible with that dispatcher after parsing.

## Current Evidence

1. `OperationInvocationRequest` currently carries unversioned `invoke` and `check-permission`
   variants through `POST /operations`.
2. `parseOperationInvocationRequest` validates their common shape, while the server dispatcher
   owns canonical Operation resolution, input-schema hydration, permission checks, projections,
   execution, and semantic results.
3. Authority is supplied when the server application composes that dispatcher; no authority value
   belongs in a portable request.
4. Starting a Durable Operation is already an ordinary Operation invocation. A successful start
   returns `TaskRunRef` through `invocation-result`; polling its snapshot is a separate, currently
   unversioned lifecycle surface.
5. Current Operation result, permission result, and protocol-error bodies are selected by the
   request kind. Version 1 does not need another response wrapper inside the common Runtime Protocol
   response envelope.

## Scope

1. Define public `OperationProtocolRequestV1` types for `invoke` and `check-permission`.
2. Add a fail-closed parser and authoring factory that require body version 1, strict known keys,
   valid Operation identity, legal View placement, and JSON-safe portable input/View values.
3. Extend the existing Operation protocol error codes with `unsupported_version` rather than
   inventing a second error algebra.
4. Register the `operation` Runtime Protocol family by delegating to the new canonical parser.
5. Publish one canonical `runtimeProtocolFamilies` tuple containing `operation`, `graph.read`, and
   `graph.command` while retaining the narrower Data Graph tuple.
6. Prove ordinary invocation, permission check, projected invocation, invalid/unknown versions, and
   a Durable start result containing portable `TaskRunRef` identity.
7. Update Plan 146, Atlas, developer documentation, and add a Core Changeset.

## Non-Goals

1. No Core execution dispatcher, Express `/runtime` endpoint, Fetch migration, or legacy endpoint
   behavior change.
2. No Task inspect, progress, cancellation, retry, idempotency, or pushed Durable lifecycle family.
3. No authority, Principal, session, capability, or policy values authored into the request.
4. No new Operation result/failure algebra and no flattening into common protocol success/failure.
5. No general response-parser rewrite; family version 1 selects the existing typed Operation
   response variants carried as the Runtime Protocol response body.
6. No Event modeling or transport work.

## Acceptance Checklist

- [x] `operation` body version 1 preserves existing invoke/check-permission semantics through JSON.
- [x] Unknown body versions and unknown strict keys fail before dispatcher execution.
- [x] Inputs and Views must be portable JSON and Views remain legal only for invocation.
- [x] The canonical parsed request remains assignable to the existing Operation dispatcher.
- [x] The family registry returns a typed union across Operation, Graph Read, and Graph Command.
- [x] Durable start remains ordinary invocation and preserves `TaskRunRef` without conflating
      exchange and run identities.
- [x] Existing legacy parsers, Express/Next handlers, Fetch clients, and endpoint paths are
      unchanged.
- [x] Semantic tests, coverage, typecheck, lint, formatting, build, artifact verification, and
      Changeset status pass.
- [x] Atlas and developer documentation record the family contract and remaining Durable gap.

## Delivery Evidence

1. Core publishes version 1 `invoke` and `check-permission` Operation bodies, a strict parser,
   portable authoring factory, and the registered `operation` family.
2. The parser delegates semantic shape validation to the legacy Operation parser after enforcing
   version, strict keys, and JSON portability; parsed requests remain assignable to the existing
   dispatcher without a second execution path.
3. `runtimeProtocolFamilies` exposes the typed canonical tuple for `operation`, `graph.read`, and
   `graph.command`, while the narrower Data Graph tuple remains public.
4. Tests distinguish exchange identity from a Durable start's returned `TaskRunRef` and leave Task
   inspection, progress, cancellation, and push outside this slice.
5. The legacy HTTP/Fetch adapters are unchanged. Atlas and developer docs record the migration
   boundary, and a Core minor Changeset records the new public contract.
