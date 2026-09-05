---
id: ontahi.runtime-protocol
kind: system-primitive
title: Ontahí Runtime Protocol
parent: ontahi.application-architecture-surface
status: in-progress
horizon: now
supports:
  - ontahi.data-graph-execution-routing
  - ontahi.model.operation-invocation
  - ontahi.model.durable-operation
  - ontahi.durable-workflows
  - ontahi.runtime-capability-model
relatedPlans:
  - ontahi://plans/128-ontahi-data-graph-execution-bridge
  - ontahi://plans/132-durable-invocation-identity-and-idempotency
  - ontahi://plans/138b-conditional-exact-entity-mutations
  - ontahi://plans/145-ordered-relations-and-sequence-commands
  - ontahi://plans/146-ontahi-runtime-protocol
  - ontahi://plans/146a-runtime-protocol-envelope-and-family-registry
  - ontahi://plans/146b-versioned-operation-protocol-family
  - ontahi://plans/146c-runtime-protocol-dispatcher
  - ontahi://plans/146d-versioned-durable-operation-observation-protocol
  - ontahi://plans/146e-runtime-transport-durable-observation
  - ontahi://plans/146f-nextjs-runtime-protocol-adapter
  - ontahi://plans/146g-unified-fetch-runtime-protocol-clients
  - ontahi://plans/146h-websocket-runtime-transport-and-durable-progress
---

The Ontahí Runtime Protocol is the transport-independent contract through which distributed
runtimes exchange semantic requests, results, rejections, lifecycle observations, and Events. Its
message families cover Operation invocation, Durable Operation lifecycle, Data Graph reads, Data
Graph Commands, and future Event subscription and delivery.

One protocol does not make these concepts interchangeable. Each family retains its own portable
and independently versioned body, authority and policy checks, execution semantics, results,
caching, and lifecycle. A strict common envelope now supplies JSON framing, exchange correlation,
family routing, fail-closed compatibility, and shared protocol diagnostics. Capability negotiation
and transport projection remain later layers. The authoritative receiver rebuilds portable values
against its canonical application model before applying family policy and execution.

HTTP, WebSocket, gRPC, queues, process-local calls, and CLI streams are projections of this
contract. Express should expose one mounted path by default while allowing hosts to route selected
message kinds through different paths for security, limits, operations, or observability. Those
paths are deployment choices rather than distinct framework protocols.

Core exposes the first envelope, typed family registry, and transport-neutral dispatcher.
`operation` body version 1 preserves the existing `invoke` and `check-permission` semantics;
`durable.operation` body version 1 observes an accepted Task run through `inspect` and a versioned
portable `snapshot`; and `graph.read` plus `graph.command` delegate to their existing canonical
parsers. A canonical tuple names all four families, and the common dispatcher routes their
validated bodies to configured family handlers without absorbing family policy or results.
Handler availability is a runtime capability: an unknown protocol family and a registered family
without a local handler remain distinct outcomes. Receiver context stays outside portable messages
and is passed directly to the selected handler.

The Express projection can mount an injected common dispatcher at `/runtime`; it never installs an
authority-free Durable handler. The host derives receiver context and explicitly maps
`durable.operation.inspect` to its Task runtime. Legacy family-specific routes remain during
migration, including the raw Task snapshot GET.

The Next.js App Router projection exposes the same injected dispatcher and context boundary
through a Web `Request`/`Response` Route Handler. It validates the canonical envelope and family
body before deriving context from the received request, preserves the Express HTTP status
semantics, and contains no family-specific switch. It likewise installs no handlers, policies,
authorization, or capabilities. Hosts choose the App Router path; family-specific Next.js adapters
remain compatibility surfaces during client migration.

The canonical Fetch client composes one Runtime Transport for `operation`, `durable.operation`,
`graph.read`, and `graph.command` at `/runtime`. A shared Core exchange helper creates a fresh
request identity, preserves correlation and abort/options flow, rejects common errors, and returns
the untouched response body to the family-owned parser. Family-specific endpoints remain a
bounded, explicitly selected compatibility mode during migration. A client never falls back
automatically from `/runtime` to a legacy route after transmission because an ambiguous Operation
or Command could execute twice.

`createFetchGraphClient` supplies that one transport to Operation hooks and reflected invocation,
the remote Graph Read/Command runtime, and Durable observation. `compatibility.operation`,
`compatibility.graphRead`, and `compatibility.graphCommand` select legacy contracts independently;
unlisted families stay on the common endpoint. Express and Next.js preserve equivalent framing,
authority, correlation, family results, and HTTP status semantics, and the same client conformance
proof exercises both projections.

The client-side `RuntimeTransport` exposes unary request exchange plus optional family
capabilities. Its Durable observer is an asynchronous snapshot sequence. The Fetch implementation
produces that sequence by repeatedly sending versioned `inspect` envelopes; React consumes the
sequence without owning polling cadence. The WebSocket implementation multiplexes the same request
envelopes and pushed Durable snapshot bodies over one lazy session. Observation controls retain a
distinct identity, while a monotonic sequence scoped to each observation lets a client key by
observation ID and discard duplicate, out-of-order, and post-terminal snapshots. Active request
identities remain protected from reuse, while completed identities are retained only in a bounded
duplicate-detection window. Abort, terminal delivery, failed sends, socket replacement, and
disconnect release their owned resources; disconnect never implies replay, resubscription, or
exactly-once delivery. A bounded server-side inspection observer supports Task Runtimes without
native push while keeping polling out of the browser. Cancellation remains only an observable
status because no current Task Runtime exposes a truthful cancellation capability. Event intents
are internal and no remote subscription contract exists.

The in-process Task Runtime now uses the native path: runtime instances sharing one Task storage
also share the framework TaskRun Query projection. A Stream adapter binds WebSocket unsubscribe and
disconnect to Effect Stream interruption while preserving the Durable snapshot body consumed by
React. Todo's WebSocket composition therefore performs no browser-side or server-side inspection
polling; the polling observer remains only an explicit compatibility option.

Graph Query observation is a separate negotiated session capability that reuses the canonical
versioned `graph.read` body in `run` mode rather than defining another Query language. Observe and
unobserve controls have their own correlation identity; pushed complete result arrays carry a
monotonic sequence and an explicit completion frame. The receiver applies the same Graph Read
policy, authority scope, projection, and limit boundary as a one-shot read. The Runtime Graph client
reconciles every accepted snapshot through canonical Entity identities before exposing it. A
disconnect terminates the observation and never implies replay or automatic resubscription.

Transport selection may be composed per complete Runtime Protocol family without changing family
bodies or hook authoring. Durable observation is routed as a separate transport capability, which
allows HTTP request/response with WebSocket push. Selection happens before transmission and never
implies automatic retry through another transport after an ambiguous failure.

For credentialed browsers, the WebSocket HTTP upgrade can restore the same host session cookie as
ordinary HTTP. That convenience also creates a Cross-Site WebSocket Hijacking boundary: the host
must validate the complete canonical browser `Origin`, including scheme and host, derive authority
outside portable frames, and enforce family policy after connection. A session-scoped context is an
authorization snapshot; immediate logout or permission revocation requires socket closure or
host-owned revalidation.

Events are an explicit design gate. Before Event subscription or delivery joins this protocol,
Ontahí must define first-class Event declaration, identity, emission, authority, lifecycle,
ordering, and durability. BookOps provides useful evidence, not a protocol definition to copy.

The protocol is also the prospective boundary between Ontahí as a specification and TypeScript as
its reference implementation. A compatible implementation in another language must preserve the
portable syntax, semantic guarantees, authority boundary, results and rejections, and pass a shared
transport-neutral conformance corpus.
