# 146i. Runtime Protocol Negotiation And Conformance

Status: backlog

Canonical ID: `ontahi://plans/146i-runtime-protocol-negotiation-and-conformance`

Parent plan: [146. Ontahí Runtime Protocol](../done/146-ontahi-runtime-protocol.md)

## Summary

Complete the language- and transport-neutral Runtime Protocol specification after the WebSocket
proof supplies a second concrete topology. Define capability and required-guarantee negotiation,
normative examples, a machine-readable conformance corpus, legacy-endpoint retirement criteria, and
Durable cancellation only when Task Runtimes expose an enforceable capability.

## Scope

1. Distinguish advertised families, transport capabilities, and semantic guarantees.
2. Fail closed when a required guarantee is unknown or unavailable.
3. Publish normative request, result, rejection, protocol-error, and session examples.
4. Build a transport-independent conformance corpus and validate one implementation that does not
   import Ontahí TypeScript.
5. Define the release and migration boundary for legacy family-specific endpoints.
6. Add Durable cancellation only after its runtime semantics are enforceable and observable.

## Non-Goals

1. No Event subscription semantics; Plan 146j owns that gate.
2. No provider-name capability vocabulary.
3. No requirement that every transport implement every family.

## Acceptance Checklist

- [ ] Required guarantees are versioned, inspectable, and fail closed before execution.
- [ ] Capability negotiation works across at least unary Fetch and session WebSocket topologies.
- [ ] A machine-readable corpus validates a non-TypeScript implementation.
- [ ] Legacy endpoint retirement has migration evidence and a release boundary.
- [ ] Cancellation is absent or enforceable; it is never an advisory fiction.
