# 146a. Runtime Protocol Envelope And Family Registry

Status: done

Parent plan: [146. Ontahí Runtime Protocol](./146-ontahi-runtime-protocol.md)

Canonical ID: `ontahi://plans/146a-runtime-protocol-envelope-and-family-registry`

## Summary

Define the smallest transport-independent envelope and family registry that can carry Ontahí
runtime messages without weakening the contracts already owned by each message family. Prove the
shape by wrapping the existing versioned Graph Read and Graph Command requests and responses in
Core. Do not mount a common HTTP endpoint or replace any dispatcher in this slice.

The envelope owns correlation, family routing, strict JSON framing, and compatibility. The body
keeps its family version and complete canonical request:

```json
{
  "protocol": "ontahi.runtime",
  "version": 1,
  "id": "request-123",
  "kind": "request",
  "family": "graph.command",
  "body": {
    "version": 2,
    "kind": "graph-command",
    "command": {}
  }
}
```

Envelope versioning and family versioning are independent. A conditional Entity mutation still
requires Graph Command body version 2 even though it travels through Runtime Protocol envelope
version 1. An older receiver must reject an unknown envelope version, family, strict envelope key,
or family-body version before execution.

## Current Remote Contract Inventory

| Family or surface    | Current request                     | Current response                        | Express convention                     | Compatibility state       |
| -------------------- | ----------------------------------- | --------------------------------------- | -------------------------------------- | ------------------------- |
| Operation invocation | Unversioned `invoke` body           | `invocation-result` or `protocol-error` | `POST /operations`                     | Body versioning absent    |
| Operation permission | Unversioned `check-permission` body | `permission-result` or `protocol-error` | `POST /operations`                     | Shares invocation parser  |
| Graph Read           | `graph-read` version 1              | `graph-read-result` or `protocol-error` | `POST /graph/reads`                    | Versioned and fail-closed |
| Graph Command        | `graph-command` version 1 or 2      | result, rejection, or `protocol-error`  | `POST /graph/commands`                 | Versioned and fail-closed |
| Durable inspection   | Task/run identity in URL            | Raw `TaskSnapshot` or HTTP error        | `GET /operations/tasks/:taskId/:runId` | No message envelope       |

Additional HTTP surfaces are not silently folded into this registry. External HTTP ingress adapts
a provider protocol into an Operation and is not runtime-to-runtime messaging. Application and
Explorer reflection endpoints expose descriptions and authorized reflected reads; their eventual
protocol ownership remains an explicit Plan 146 decision.

Authority is never authored into the envelope. Express, WebSocket, process-local, or another
transport derives trusted invocation context independently and supplies it to the canonical family
dispatcher.

## Scope

1. Add public Core request, response, and protocol-error envelope contracts using JSON-safe data.
2. Define opaque request identity as transport correlation only; it is not a Durable Operation run
   identity, delivery identity, attempt identity, or idempotency key.
3. Add a typed family definition and registry that validates the strict outer envelope, rejects
   duplicate/unknown families, and delegates body parsing to the canonical family parser.
4. Register `graph.read` and `graph.command` adapters over the existing parsers without copying
   Query, Command, policy, or authority validation.
5. Preserve the exact family body and its independent version on requests and responses.
6. Validate response correlation by protocol, envelope version, request id, and family.
7. Document the normative first envelope, inventory, compatibility rules, and migration boundary.
8. Add a public Core Changeset.

## Non-Goals

1. No Core execution dispatcher, Express `/runtime` endpoint, Fetch migration, or old-path removal.
2. No Operation or Durable Operation body migration in this slice; inventory their gaps first.
3. No capability negotiation, retry policy, idempotency, streaming, WebSocket, gRPC, or CLI adapter.
4. No response-level attempt to flatten Operation results and Graph Command rejections into one
   false universal success/failure algebra. The family body retains semantic ownership.
5. No Event envelope. Plan 146 stops for a first-class Event model review before that work begins.
6. No reflection or external ingress family without a separate ownership decision.

## Acceptance Checklist

- [x] Envelope and body versions remain independent and are both preserved through JSON.
- [x] Request ids correlate one exchange without acquiring retry or idempotency semantics.
- [x] Unknown envelope versions, strict keys, families, and invalid family bodies fail closed.
- [x] Duplicate family registrations fail during registry construction.
- [x] Graph Read and Graph Command bodies use their existing parsers and remain canonical.
- [x] Responses preserve the request id/family and reject mismatched correlation or non-JSON data.
- [x] Semantic tests cover complete values and failure categories without snapshot-only assertions.
- [x] Focused/full Core tests, coverage, typecheck, lint, formatting, build, artifact verification,
      and Changeset status pass.
- [x] Atlas and developer documentation record the contract, inventory, and Event stop gate.

## Delivery Evidence

1. `@ontahi/core/runtime/protocol` publishes strict request, response, and common protocol-error
   envelopes with independent envelope/family versions and exact exchange correlation.
2. The typed registry rejects malformed framing, duplicate or unknown families, and invalid family
   bodies before execution while preserving JSON-safe family diagnostics.
3. `graph.read` and `graph.command` delegate to their existing canonical parsers; conditional Graph
   Commands prove body version 2 remains inside envelope version 1.
4. The current Operation, Graph Read, Graph Command, Durable inspection, reflection, and external
   ingress surfaces are inventoried without changing endpoints or inventing a dispatcher.
5. Atlas and developer docs establish the protocol boundary and the first-class Event design gate;
   a Core minor Changeset records the new public subpath.
