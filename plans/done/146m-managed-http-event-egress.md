# 146m. Managed HTTP Event Egress

Status: done

Canonical ID: `ontahi://plans/146m-managed-http-event-egress`

Parent plan:

1. [146l. Event Brokers, Egress, And Durable Processing](../backlog/146l-event-brokers-egress-and-processing.md)

Related plans:

1. [146j. First-Class Events Runtime Protocol Gate](../done/146j-first-class-events-runtime-protocol-gate.md)
2. [158. Semantic Execution Context, Governance, And Evidence](../research/158-semantic-execution-context-governance-and-evidence.md)
3. [160. Semantic Modules, Composition, And System Boundaries](../research/160-semantic-modules-composition-and-system-boundaries.md)
4. [120. Environment Resources And Semantic Bindings](../next/120-ontahi-environment-resources-and-semantic-bindings.md)

Shapes: [Event](../../atlas/items/model/event.md),
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md),
[Authority And Policies](../../atlas/items/authority-and-policies.md), and
[Application Architecture Surface](../../atlas/items/application-architecture-surface.md).

## Summary

Implement the first external Event egress vertical: an application-admitted subscription selects a
declared Event and causes each matching durable Event Delivery to be projected, signed, and sent to
an HTTP destination. Ontahí owns occurrence-to-delivery identity, claim/lease/acknowledgement,
attempt classification, and safe evidence. The application owns which Events may leave its system,
which destinations are admitted, which payload is disclosed, and which retry policy applies.

This slice should reuse the existing durable Event Runtime instead of creating another queue. The
PostgreSQL and MySQL runtimes already retain Event Occurrences, stable subscriptions, matching
Deliveries, attempt numbers, leases, acknowledgement, release, cancellation, and restart recovery.
The missing layer claims those deliveries and interprets them through an external egress binding.

The durable thesis is:

> **External Event egress is a managed projection of a canonical Event Delivery through an admitted
> destination and transport. It is not an Event declaration, an arbitrary callback, or the
> communication model between federated Ontahí runtimes.**

## Concrete Vertical

Use a small application-owned subscription to one declared Event, such as an export-completed fact:

```ts
const CustomerWebhook = eventEgressSubscription({
  id: 'customer-export-webhook',
  event: ExportCompleted,
  destination: resourceRef('customer-webhook'),
  project: occurrence => ({
    id: occurrence.occurrenceId,
    type: occurrence.eventId,
    version: occurrence.eventVersion,
    occurredAt: occurrence.occurredAt,
    data: occurrence.payload,
  }),
  signing: httpHmacSignature({ secret: resourceRef('customer-webhook-signing-key') }),
});
```

The example expresses desired meaning, not an accepted public API. In particular, destination URLs
and signing keys are environment Resources, never Event metadata or client-provided subscription
fields.

Plan 120 has not yet established a general `resourceRef(...)` authoring API. This vertical must not
make that whole research plan a prerequisite or publish an egress-only imitation of it. The first
proof may inject a typed destination resolver keyed by a stable destination id; the resulting
evidence should feed Plan 120 before a common Resource declaration is accepted.

The application starts or invokes a bounded egress processor over that subscription:

```text
claim durable Event Delivery
  -> resolve admitted destination and signing Resources
  -> project the external payload
  -> create one transport attempt
  -> send HTTP request
  -> classify outcome
  -> acknowledge or release the claim
  -> emit safe attempt evidence
```

One processor invocation may handle one claim or a bounded batch. Continuous worker scheduling,
deployment, concurrency, and shutdown belong to the host adapter rather than an immortal loop in
Core.

## Boundaries And Identities

The vertical must keep these identities and responsibilities separate:

| Concept              | Meaning                                                        | Owner                             |
| -------------------- | -------------------------------------------------------------- | --------------------------------- |
| Event declaration    | Stable application fact contract                               | semantic Application              |
| Event occurrence     | Immutable accepted fact                                        | Event Runtime                     |
| Egress subscription  | Admitted selector, projection, destination binding, and policy | application/runtime configuration |
| Event delivery       | One occurrence matched to one subscription                     | durable Event Runtime             |
| Delivery claim       | Temporary worker lease over one delivery                       | durable Event Runtime             |
| Egress attempt       | One concrete use of a transport for the claimed delivery       | egress processor                  |
| Destination Resource | URL, credentials, provider configuration, and capability       | environment binding               |
| Transport            | HTTP mechanics and normalized response                         | adapter                           |

The existing `EventDelivery.attempt` counts durable claims and survives release or lease expiry. The
first implementation may use that number as the egress attempt number only while each claim performs
at most one transport send. If a transport adapter retries internally, its sub-attempts must be
separately observable or disabled; they must not falsify the canonical attempt count.

External subscription state is not automatically a domain Entity. This first slice may use static,
application-owned registration. User-managed CRUD, ownership UI, billing, and arbitrary destination
registration are separate product surfaces that require authorization research.

## Transport-Neutral Kernel And HTTP Adapter

Core should name only the smallest transport-neutral request and outcome needed by this vertical.
Provisional forms:

```ts
type OutboundEventDelivery = {
  deliveryId: string;
  attempt: number;
  destination: EgressDestinationRef;
  body: JsonValue;
  headers: Readonly<Record<string, string>>;
  context?: SafePropagationContext;
};

type EgressAttemptOutcome =
  | { kind: 'accepted'; status?: number }
  | { kind: 'retryable'; status?: number; retryAfterMs?: number; reason: string }
  | { kind: 'rejected'; status?: number; reason: string };

interface EventEgressTransport {
  deliver(request: OutboundEventDelivery): Promise<EgressAttemptOutcome>;
}
```

These names remain provisional. `OutboundRequest` is too HTTP/RPC-shaped as the primary semantic
concept: queue publication and broker delivery may not have request/response semantics. The kernel
concept is an outbound Event Delivery; HTTP may lower it to an `HttpRequest` internally.

The HTTP adapter owns URL resolution, method, headers, timeouts, request signing, response capture,
and safe body disposal. Core owns only normalized attempt outcomes. A future queue or broker adapter
must be able to implement the transport port without pretending to return an HTTP response.

## Outcome And Retry Semantics

The first slice must make classification explicit and injectable. A safe default candidate is:

1. HTTP `2xx` -> `accepted` -> acknowledge the durable claim;
2. network failure, timeout, `408`, `429`, or `5xx` -> `retryable` -> release the claim;
3. other `4xx` -> `rejected` -> apply explicit terminal policy rather than retry forever.

The current durable Event capability exposes `acknowledge` and `release`, but no terminal-failure or
dead-letter operation. The implementation must not silently treat a rejected delivery as successful
or claim retained dead-letter history that does not exist. Before supporting terminal rejection,
choose one bounded option:

1. extend the durable capability with a provider-neutral terminal outcome proven by PostgreSQL and
   MySQL; or
2. keep terminal rejection outside the first accepted outcome set and fail closed, leaving the
   claim recoverable for operator policy.

Backoff scheduling is also not currently modeled by `release`. A tight retry loop is forbidden.
The host processor must honor `retryAfterMs` or a configured backoff before another claim, or the
durable capability must gain an explicit next-attempt time. The smallest proof may process one
attempt per invocation and leave scheduling to a deterministic test host.

No exactly-once claim is possible. A receiver may accept the HTTP request while the sender loses the
response before acknowledgement. The adapter should therefore send stable occurrence, delivery,
subscription, and attempt identifiers so an external consumer can implement idempotency according
to its own contract.

## Projection, Signing, And Disclosure

The canonical Event Occurrence is not automatically the external payload. The subscription must
select an application-owned projection that can:

1. rename or omit fields;
2. hide internal correlation, causation, Principal, and topology details;
3. produce one versioned external envelope;
4. remain deterministic for a stable delivery attempt unless policy intentionally changes it.

Signing happens after projection over the exact transmitted bytes. Signature algorithm and header
names belong to the HTTP adapter or signing strategy; the secret comes from an environment Resource.
Logs and Devtools may show destination identity, status, timing, byte counts, and safe semantic
lineage, but must not expose secrets, authorization headers, full sensitive payloads, or response
bodies by default.

Destination admission is application policy, not proof that an arbitrary URL is safe. The first
slice should prefer named, host-configured destination Resources and must not accept caller-supplied
URLs. Redirect behavior, DNS rebinding, private-network access, certificate validation, and secret
scope are adapter security concerns that fail closed.

## Execution Context And Evidence

An outbound attempt should preserve safe causal linkage to the Event Occurrence and originating
semantic execution. It must not serialize the full trusted invocation context into the external
payload or headers.

The processor should expose bounded evidence containing, where available:

1. subscription, occurrence, delivery, and attempt identities;
2. Event id and version;
3. destination identity, never raw credentials;
4. started/completed timestamps or duration;
5. normalized outcome and safe status metadata;
6. admitted correlation/causation and W3C Trace Context propagation decisions;
7. claim acknowledgement or release result.

This evidence may feed Devtools or a host observability adapter. The first slice does not require a
durable audit store or permanent attempt-history database. If the product requires durable external
delivery history, extract a follow-up that defines retention, redaction, query, and terminal-outcome
semantics rather than making every Event Runtime store it implicitly.

## Capability And Failure Boundary

Managed egress requires a durable Event Runtime with retention, durable acceptance, durable
delivery, acknowledgement, and the claim API. Startup or registration must fail clearly when the
configured runtime lacks those capabilities. The in-memory Event Runtime is suitable for a bounded
transport unit test but cannot satisfy restart-safe managed egress.

The processor must distinguish:

1. invalid subscription or undeclared Event;
2. unavailable durable Event capabilities;
3. destination Resource resolution failure;
4. projection or signing failure;
5. retryable transport outcome;
6. terminal transport rejection;
7. stale or lost delivery claim;
8. acknowledgement/release failure.

An egress failure occurs after the Event fact has been accepted. It cannot retract the occurrence or
roll back the domain Unit Of Work that caused it.

## Execution Slices

1. **Fix the contract with a fake transport**
   - define application-owned subscription, destination reference, projection, transport port, and
     normalized outcome;
   - run one retained delivery through claim, projection, accepted outcome, and acknowledgement;
   - prove retryable outcome releases the same delivery for a later incremented attempt.
2. **Resolve terminal and delayed retry semantics**
   - choose the minimal honest behavior for rejected outcomes;
   - prevent immediate retry loops and make scheduling ownership explicit;
   - extend durable provider contracts only if the vertical cannot remain truthful without it.
3. **Add the HTTP adapter**
   - deliver exact JSON bytes to an in-process test HTTP receiver;
   - implement timeout, status classification, redirect policy, stable idempotency headers, and
     response-body limits;
   - sign the exact transmitted body using a Resource-backed secret.
4. **Prove durable recovery**
   - use one existing SQL Event Runtime to show occurrence-before-worker, process recreation,
     retry after failure, and no delivery after acknowledgement;
   - run provider-neutral conformance if a durable capability changes.
5. **Expose safe evidence**
   - project one accepted and one retryable attempt to bounded diagnostics;
   - verify secrets and payload fields selected as sensitive are absent.
6. **Integrate one example**
   - use Todo's existing typed `TodoListExportReady` Event and durable SQL Event Runtime;
   - deliver it to a local receiver without application-owned retry or signing code.
7. **Extract follow-ups**
   - dynamic subscription management and authorization;
   - durable attempt history and dead letters;
   - declarative ingress bindings and one-to-many Event mapping;
   - queue/broker transports;
   - System Boundary authoring facade.

## Scope

1. One application-configured external subscription to one declared Event version.
2. One named destination Resource resolved by trusted host configuration.
3. One deterministic payload projection and external envelope.
4. One transport-neutral delivery port and one HTTP adapter.
5. Claim, one transport attempt, normalized outcome, acknowledgement or release.
6. Stable idempotency and causal identifiers.
7. HMAC signing with an injected secret Resource.
8. Bounded safe evidence and one real SQL-backed recovery proof.

## Non-Goals

1. No public subscription-management API or UI.
2. No caller-supplied arbitrary URLs or secrets.
3. No advanced Event predicates, arbitrary graph queries, or general replay API.
4. No Kafka, RabbitMQ, NATS, Redis, WebSocket, gRPC, or cloud-provider adapter yet.
5. No exactly-once claim or distributed transaction with the external receiver.
6. No automatic conversion of every Event into public egress.
7. No cross-runtime Ontahí federation; Plan 142h owns that semantic boundary.
8. No requirement that Module integration use external egress.
9. No mandatory durable audit database or indefinite response/payload retention.
10. No final `SystemBoundary` DSL until ingress and egress verticals prove its common shape.

## Open Questions

1. Should the egress processor register the selector in the durable Event Runtime, or should
   application composition register all static subscriptions before workers start?
2. Does a terminal rejected outcome require extending `DurableEventDeliveryCapability`, or can the
   first slice remain honest with fail-closed operator recovery?
3. Should delayed retry become part of the durable Event delivery contract, a Task Runtime concern,
   or host scheduling around one-attempt processor invocations?
4. Which parts of payload projection must be declarative and reflected versus trusted application
   code in this first vertical?
5. Which stable headers should be transport conventions for occurrence, delivery, subscription,
   and attempt identity?
6. Does HMAC signing belong to the HTTP transport adapter or a composable pre-transport projection
   pipeline?
7. How does destination Resource governance account for rate limits, quotas, cost, circuit breaking,
   and concurrency without making them Event semantics?
8. Which causal fields may cross an external trust boundary by default, and which require explicit
   disclosure policy?

## Acceptance Checklist

- [x] One declared Event reaches one local HTTP receiver through a named, application-admitted
      subscription and destination Resource.
- [x] Event occurrence, subscription, delivery, claim, and transport-attempt identities remain
      distinct and inspectable.
- [x] A `2xx` response acknowledges the durable delivery exactly once from Ontahí's perspective.
- [x] A retryable failure preserves delivery identity, increments attempt on the next claim, and
      cannot create a tight retry loop.
- [x] Terminal rejection behavior is explicit and does not masquerade as successful delivery.
- [x] Process recreation retains pending delivery without retaining a JavaScript callback or stack.
- [x] The transmitted envelope carries stable idempotency identifiers and a verifiable signature.
- [x] Event declarations contain no URL, credential, signing key, or provider topology.
- [x] Safe diagnostics show outcome and causal ownership without exposing secrets or sensitive
      payloads.
- [x] Unsupported Event Runtime capabilities fail before the worker claims delivery.
- [x] Domain commit and Event acceptance remain complete even when external delivery later fails.
- [x] The HTTP adapter can be replaced by a fake transport without changing subscription or
      delivery lifecycle semantics.

## Implementation Checkpoint: Transport-Neutral Kernel

The first execution slice is implemented in `@ontahi/core`:

1. `eventEgressSubscription(...)` preserves declaration-specific payload typing while naming one
   stable subscription and destination identity;
2. `registerEventEgressSubscription(...)` registers the static selector through the existing
   durable Event Delivery capability and fails early for an incapable runtime;
3. `processNextEventEgressDelivery(...)` claims at most one delivery, validates Event identity,
   resolves the destination, projects a JSON-safe body, invokes an injected transport, and then
   acknowledges or releases the claim;
4. accepted and retryable results expose bounded evidence without returning the destination value
   or projected body;
5. resolution, projection, and transport failures release the claim before propagating, while a
   simultaneous release failure preserves both causes;
6. focused coverage proves stable delivery identity, incremented attempt after release, idle
   polling, invalid projection, mismatched Event identity, unsupported runtimes, and typed payload
   projection.

At this checkpoint there was deliberately no worker loop, delayed scheduling, terminal rejection,
dead-letter state, HTTP implementation, signing, or SQL-backed example integration. The later
durable lifecycle checkpoint below supersedes the delayed-retry and terminal-rejection limits.

## Implementation Checkpoint: Generic HTTP Adapter

The HTTP execution slice is implemented in the optional `@ontahi/runtime-http` package:

1. `createHttpEventEgressTransport(...)` implements Core's transport-neutral port without owning
   subscriptions, durable claims, worker scheduling, or destination admission;
2. every invocation performs exactly one Fetch `POST`, so the canonical durable attempt count is
   not obscured by adapter-local retries;
3. exact projected JSON bytes are serialized once, optionally signed with HMAC-SHA256, and sent
   with stable Event, occurrence, subscription, delivery, attempt, and idempotency headers;
4. bounded timeout, HTTP(S)-only URLs, credential-free URLs, and manual redirect handling fail
   closed at the transport boundary;
5. `2xx` is accepted, while network failure, timeout, `408`, `429`, and `5xx` become retryable
   outcomes; `Retry-After` is projected into the durable availability timestamp;
6. other statuses become rejected outcomes, causing the Core processor to persist terminal failure;
7. an in-process HTTP receiver proves the transmitted body, headers, signature, and accepted
   outcome, while focused tests cover classification and invalid destinations.

The next vertical is the SQL-backed application proof: register one real subscription before an
occurrence, recreate the processor, deliver through this adapter, prove release/reclaim identity,
and acknowledge exactly once. That proof should also decide whether the Todo example is the right
permanent executable surface or whether a smaller integration fixture better preserves its focus.

## Implementation Checkpoint: SQL Recovery And Symmetric HTTP Boundary

The durable proof and the complementary ingress boundary are now implemented together:

1. PostgreSQL retains a declared Event occurrence and static egress subscription before the worker
   exists, then a recreated runtime processes the pending delivery;
2. a local HTTP receiver first returns `503` with `Retry-After`, causing release, and then accepts
   the reclaimed delivery with the same delivery/body identity and incremented attempt;
3. the accepted attempt acknowledges the delivery, and another recreated processor observes the
   subscription as idle;
4. the receiver verifies the HMAC signature over the exact stable body, proving that durable
   recovery and real HTTP lowering compose without an application-owned retry loop;
5. `@ontahi/runtime-http/ingress` now composes Operation and Event routes behind one Web
   `Request → Response` handler used by Express and Next.js;
6. `@ontahi/runtime-http/node` hosts that same handler directly on a bounded `node:http` server,
   proving that a framework adapter is optional rather than part of the application model.

The durable lifecycle follow-up now adds provider-neutral `retryAfter` and `fail` settlements, proves
them through the shared conformance suite and the PostgreSQL/MySQL providers, and lets the HTTP
adapter classify terminal rejection without owning persistence policy. A retryable attempt is not
claimable before its persisted availability time, preventing tight host polling loops.

Plan 146n follows with a deliberately smaller retained-state inspection capability. It exposes the
current lifecycle facts already stored by SQL runtimes, with an explicit query bound and a
payload-free result, without adding attempt history, cursor traversal, replay, or an audit store.
The generic HTTP ingress direction can separately grow Runtime Protocol endpoints when that reuse
is proven, without turning this package into a web framework.

## Closure

The transport-neutral processor, generic HTTP adapter, delayed retry, terminal failure, stable
headers, HMAC signature, SQL recreation proof, and bounded attempt evidence now satisfy this
vertical. Dynamic subscription management, queue transports, resource governance, and federation
remain separate plans rather than hidden expansion of HTTP egress.
