# 128. Ontahi Data Graph Execution Bridge

Status: current

Canonical ID: `ontahi://plans/128-data-graph-execution-bridge`

Migrated from: `bookops://plans/128-data-graph-execution-bridge`
Original path: `plans/next/128-ontahi-data-graph-execution-bridge.md`
Source commit: `67713696`

## Summary

Let the same Ontahi Selection, Query, or Command execute through the runtime available at the call
site. A browser runtime with safe storage access may lower the graph program directly. A browser
whose storage is server-only may transport that graph program to a server runtime and receive the
same result without requiring a wrapper Domain Operation.

A Domain Operation remains the language for named domain behavior, invariants, side effects,
contracts, durable execution, and intent. It should not be a mandatory transport envelope around
ordinary graph reads and writes.

## Context

The operation-first bridge proved that Ontahi can transport a semantic invocation independently
from HTTP, Next.js, or Express. It also exposed a category mistake in the current client ergonomics:
a developer must sometimes declare an Operation only because the browser cannot reach PostgreSQL.

```ts
const visibleTodos = TodoItem.selection(todo => todo.completed.eq(false));

await visibleTodos.orderBy(todo => todo.title).run();
await visibleTodos.update({ completed: true }).run();
```

Those statements already describe complete data-graph programs. Whether they lower to Supabase in
the browser or cross a server boundary before lowering to PostgreSQL is an execution-topology
decision, not additional domain meaning.

Related work:

1. [55. Runtime-Agnostic Data Graph And Pluggable Adapters](bookops://plans/55-runtime-agnostic-data-graph-and-pluggable-adapters)
2. [57. Client Runtime Bridge And Server Dispatch](bookops://plans/57-client-runtime-bridge-and-server-dispatch)
3. [68j. Graph Execution Authority API](bookops://plans/68j-graph-execution-authority-api)
4. [116. Ontahi Selection Model](../done/116-ontahi-selection-model.md)
5. [118. Ontahi Selection Language Editor](bookops://plans/118-ontahi-selection-language-editor)
6. [128a. Recursive Views And Projectable Operation Results](../done/128a-ontahi-recursive-views-and-projectable-operation-results.md)
7. [128b. Projectable Operation Client Bridge](../done/128b-ontahi-projectable-operation-client-bridge.md)
8. [134. Semantic Codegen Pipeline, Organization, And Coverage](./134-codegen-analysis-organization-and-semantic-coverage.md)

## Architectural Thesis

```mermaid
flowchart LR
  Code["Ubiquitous graph code\nSelection / Query / Command"] --> Runtime{"Bound graph runtime"}
  Runtime -->|direct capability| Direct["Storage adapter\nSupabase / local / embedded"]
  Runtime -->|remote capability| Bridge["Data Graph bridge"]
  Bridge --> Boundary["Server graph boundary\nvalidation + policy + authority"]
  Boundary --> ServerAdapter["Server storage adapter\nPostgreSQL / MySQL / other"]
```

The runtime binding owns execution. The portable graph program does not know whether execution is
local, direct-to-storage, remote, cached, observed, or eventually split across graph segments.

Operation invocation and graph execution are parallel protocols:

1. **Operation invocation** transports named domain intent and its typed input.
2. **Graph execution** transports a canonical Query or Command program.

An Operation may execute graph programs internally. A graph program does not become an Operation
merely because it crosses a process boundary.

## Scope

1. Define canonical transport-safe Query and Command request forms.
2. Bind `Selection.run()`, shaped reads, and Commands to either direct or remote runtimes.
3. Define a server graph dispatcher independently from HTTP framework adapters.
4. Model graph access policy independently from transport choice.
5. Preserve authority, validation, cardinality, result, failure, cache, and observability semantics
   across both execution paths.
6. Prove API parity with one direct-storage browser topology and one server-storage topology.

## Non-Goals

1. Do not make every Entity, field, operator, or Command remotely accessible by default.
2. Do not treat client-side validation as a security boundary.
3. Do not replace Domain Operations that encode domain behavior or invariants.
4. Do not make the wire representation provider-specific.
5. Do not hide unsupported provider capabilities behind silent fallback behavior.

## Canonical Programs

A remote read needs the same semantics already present in a built graph read:

1. root Entity identity,
2. Selection AST,
3. projection and includes,
4. ordering and limit/pagination,
5. cardinality and read mode (`get`, `run`, or `count`); stream-like observation remains a later
   versioned transport capability,
6. authority and request context supplied by the runtime rather than authored into the AST.

A remote Command additionally needs:

1. command kind (`insert`, `upsert`, `update`, or `delete`),
2. payload,
3. returning shape,
4. cardinality and conflict semantics.

The server must rebuild and validate the canonical program against its registered graph. It must
not accept executable JavaScript, adapter queries, table names, or arbitrary SQL.

## Policy Is Not Transport

The concern that “a client could execute any query or update” is valid, but wrapper Operations are
only an accidental allowlist. They duplicate graph code and couple authorization to distribution.

Declaring or registering an Entity never grants remote access to it. Registration only lets the
authoritative runtime resolve its semantic identity; a separate, explicit remote graph policy must
opt that Entity and its permitted surface into remote execution. Missing policy is a denial, not an
implicit full-access default.

The graph boundary needs explicit policy over semantic programs. Candidate dimensions include:

1. which Entities are readable or writable;
2. which fields may be selected, filtered, ordered, inserted, or changed;
3. which operators and relation traversals are allowed;
4. maximum page size, affected-row count, and command cardinality;
5. an authority-derived Selection that is intersected with every requested target;
6. predicates or invariants that require escalation to a Domain Operation;
7. separate defaults for reads and Commands, with remote Commands defaulting to deny.

The policy model should be reflectable enough for clients and Explorer to anticipate available
behavior, while enforcement remains at the authoritative execution boundary.

An owner or tenant constraint is an authority scope, not a coarse `public`/`private` Entity flag.
The server derives that scope from trusted invocation authority and intersects it with the caller's
Selection before execution. The caller cannot provide or weaken the authority scope. Row scope is
necessary but insufficient by itself: policy must also constrain selected fields, filter and order
fields, operators, relation traversal, cardinality, and limits. A remotely readable `User` Entity,
for example, may still deny credentials entirely and constrain visible rows to the current owner or
organization. Every exposed policy must choose a scope explicitly: either an authority-derived
Selection or `all` for deliberately public rows. Omitting scope never means all rows.

### Canonical Policy And Authoring Ergonomics

The policy representation enforced by the dispatcher is the canonical semantic form. It should be
unambiguous, reflectable, independently validatable, and expressive enough to describe every
allowed field capability and recursive relation surface. That makes it a good execution boundary
but not necessarily the only or best authoring API.

Ergonomic declarations may compile into that canonical form. Candidate authoring layers include
field-oriented lists, fluent builders, reusable policy fragments, and a recursive View used as the
maximum permitted projection surface. Ontahi should not prematurely require one ergonomic style,
and different styles must preserve the same default-deny semantics. In particular, shortcuts such
as `selectAll` or `allExcept` must not silently expose a field added to an Entity later.

Policy remains separate from the Entity's canonical ontology because it varies by application,
execution boundary, audience, and authority model. An application may still colocate the concerns
for discoverability. A scalable layout could keep `trip.entity.ts`, `trip.policies.ts`, and, when
needed, split `trip.operations.ts` modules under one `entities/trip/` directory and compose them in
the server graph. A future server-graph API may offer Entity-adjacent syntax such as
`graph.expose(Trip, ...)` without embedding server-only scope functions in the Entity AST or its
browser-safe generated representation.

Direct browser storage does not weaken this rule. Supabase can safely execute from the browser only
because PostgreSQL RLS and grants enforce authority at the data boundary. Ontahi policy may describe
and preview that boundary, but client checks cannot replace it. A remote PostgreSQL adapter enforces
the corresponding policy in the server graph dispatcher.

## Runtime Routing

The call-site language stays stable:

```ts
const staleTodos = TodoItem.selection(todo => todo.updatedAt.lt(thirtyDaysAgo));

const rows = await staleTodos.orderBy(todo => todo.title).run();
await staleTodos.update({ archived: true }).run();
```

The configured runtime chooses among capabilities:

1. lower directly through a local/browser storage adapter;
2. serialize and invoke a remote graph executor;
3. reject execution because no compatible or authorized capability exists;
4. later route different Entity segments through different executors.

Routing must remain observable. Reflection and diagnostics should show where a graph program will
execute, under which authority, with which policy and provider capabilities.

## Cache And Observation

Canonical Query programs can provide stable cache identity without operation-specific
`bridge.query` functions. Commands can expose affected Entity and Selection information for cache
reconciliation without operation-specific invalidation boilerplate.

Streaming or observing a read is a later transport capability over the same Query identity. Polling,
WebSockets, server-sent events, and provider-native subscriptions should not create different query
languages.

## Execution Slices

- [x] Bind semantic Selections to an available runtime while preserving the portable Selection AST.
- [x] Define recursive caller-authored Views and projectable Selection-shaped Operation results in
      Core before freezing the remote read protocol. Completed in plan 128a.
- [x] Carry projectable Operation Views through generated clients, React, and the existing
      Operation bridge. Completed in plan 128b.
- [x] Specify a versioned Query wire protocol with validation limits.
- [x] Define a transport-neutral server dispatcher and execution callback.
- [x] Define a remote graph executor capability and runtime routing.
- [x] Shape a first-class, default-deny read policy declaration and enforcement seam.
- [x] Add an Express HTTP adapter without embedding HTTP concepts in the graph protocol.
- [x] Derive Express graph dispatch from application storage and reuse one invocation context for
      Operations and graph reads.
- [x] Add a Fetch-backed React graph executor and prove caller-authored browser Queries in the Todo
      application.
- [x] Add an equivalent Next.js route adapter over the same dispatcher and HTTP semantics.
- [x] Add ergonomic generated-client Query entry points, semantic read intents, canonical
      identity-scoped React keys, and first-class bound Operation invocations.
- [x] Publish the end-to-end application data-access path as the recommended developer API,
      including its default-deny policy and current alpha boundaries.
- [ ] Bind generated client Entities to either direct or remote graph executors.
- [ ] Prove identical Todo read code against direct and Express/PostgreSQL topologies.
- [ ] Integrate read cache identity, telemetry, and Explorer reflection.
- [ ] Specify the Command protocol only after the read path and its authority seam are proven.
- [ ] Evaluate hybrid routing as an input to future graph segmentation.

### First Proof: Runtime-Bound Selections

PR #483 implements the first slice. A Selection remains a portable membership value through
`toJSON()`, but when authored from a runtime-bound Entity it retains that execution binding.
Projection methods promote the same value to a bound read; `update`, `updateReturning`, `delete`,
and `deleteReturning` produce bound Commands. Operation Selection inputs are rehydrated with the
server Entity's runtime, so implementations use their semantic input directly.

This proof closes the ubiquitous _in-process_ language gap. It does not yet define the remote wire
protocol or its default-deny graph policy; the next slice now owns that bounded remote-read proof.

### Completed Prerequisite Slice: Recursive Views And Projectable Results

Plan 128a now owns the active transport-free proof. It defines a recursive View AST and composes a
caller-authored View with an Operation-produced Entity Selection into one final local Query plan.
This prevents the remote protocol from freezing the current `include`/`select` authoring friction or
a fixed Operation snapshot model into the wire format.

The proof uses Trip, Truck, Driver, Owner, Company, Stop, Place, and Country definitions in focused
Core tests. It does not add React, HTTP, authorization, remote Commands, or a BookOps migration.

### Completed TDD Slice: Read Program Wire Round-Trip

Start with a transport-free Core proof that one resolved Query becomes a versioned JSON-safe read
request and can be rebuilt against server-owned Entity definitions without executable JavaScript or
provider metadata.

The first request carries root Entity identity, recursive Selection, caller-authored View,
ordering, limit, cardinality, and read mode. Tests must round-trip the request through JSON and
compare the rebuilt semantic Query plan with the local one. Initial rejection coverage includes an
unsupported protocol version, unknown Entity, unknown field or operator, incompatible View, and
non-JSON-safe predicate values.

This slice does not add a remote runtime, dispatcher, policy declaration, HTTP adapter, generated
client binding, or Commands. It may preserve the applied View AST on the in-memory Query spec so the
wire encoder does not reverse-engineer caller intent from compiled `select`/`include` builders.
Plan 134 may continue reorganizing codegen independently; codegen integration waits for its
semantic emitter cutover.

### Completed TDD Slice: Default-Deny Remote Read Boundary

This proof adds a transport-neutral dispatcher whose remote Entity registry is explicit and
default-deny. It accepts the validated read protocol, resolves only policy-registered Entities,
checks the requested fields, operators, ordering, relations, cardinality, and limits, intersects a
server-derived authority Selection, and only then delegates the final Query to storage execution.

Tests prove that an Entity present in the domain graph but absent from remote policy cannot reach
the executor, that denied fields and relation paths cannot leak through a View, and that an
owner scope narrows rather than replaces the caller Selection. HTTP, generated clients, and remote
Commands remain outside this slice.

### Completed TDD Slice: Remote Read Runtime

The transport-neutral remote runtime maps the existing `get`, `run`, and `count` execution methods
to versioned read requests and accepts an injected transport callback. Runtime options such as
credentials and authority context are passed to that callback rather than serialized into the
caller-authored graph program. Remote protocol failures, malformed responses, local encoding
failures, and transport failures remain distinct structured errors.

A focused Todo proof executes one projected Query unchanged through a direct authority-scoped
runtime and through the remote runtime connected in-process to the default-deny dispatcher. The
runtime contract remains unified: Ontahi does not introduce temporary read-only runtime interfaces
merely to stage delivery. `stream` and `runCommand` instead report an explicit
`unsupported_capability` without invoking the read transport. A later Command protocol can fill in
the existing runtime capability without changing caller authoring or binding.

### Completed TDD Slice: Express HTTP Read Adapter

`@ontahi/runtime-express` now exposes an opt-in graph-read endpoint around the transport-neutral
dispatcher. One application-level invocation-context factory supplies trusted Principal and
resources to Operations and graph reads; graph policies receive that context by default and may
derive a specialized authority without trusting the request body. The default endpoint is
`POST /graph/reads`, with a configurable path, and protocol failures retain their structured body
while mapping invalid requests to `400`, denied reads to `403`, and unavailable execution to `503`.

The normal Express API accepts only the explicit policies. An application composed with
`ontahi({ storage, ... })` creates the transport-neutral dispatcher from its existing storage
runtime, so hosts do not repeat mode routing or runtime construction. A prebuilt dispatcher and
request-to-authority context remain available as a lower-level escape hatch.

A real HTTP Todo proof sends one caller-authored projected Query through the remote runtime and the
Express endpoint, then compares its result with direct in-memory execution. The request deliberately
contains a conflicting body authority; the server-owned request context remains authoritative. This
slice does not yet add a reusable browser binding, PostgreSQL integration, Next.js, or Commands.

### Completed TDD Slice: Todo Browser Read Path

`@ontahi/react/graph` now provides `createFetchGraphReadExecutor(...)`, adapting the Effect-based
remote runtime to the Promise executor already consumed by `OntahiGraphProvider` and
`useGraphQuery`. Runtime Fetch options remain outside the serialized graph request, structured
protocol errors retain their `RemoteDataGraphError` identity, and typed Effect failures cross the
browser Promise boundary without becoming opaque Fiber failures.

The Todo Express application installs explicit, default-deny read policies for `TodoList`, `Tag`,
`TodoTag`, and `TodoItem`; passes those policies to `ontahiExpress(...)`; and defines its result Views
and Queries entirely in the browser client. Its five read-only wrapper Operations (`list` for the
four Entities plus `TodoItem.itemsForList`) were removed. React now executes those reads with
`useGraphQuery`, while write, multi-Entity, Capability-bearing, authenticated, and durable behavior
continues to use domain Operations. Existing Entity-prefixed cache keys let those Operations
invalidate the new Query results without a second cache model. Todo contains no application-local
dispatcher or duplicated graph authority factory.

### Completed TDD Slice: Next.js HTTP Read Adapter

`@ontahi/runtime-nextjs/graph-read` now exposes an App Router `Request`/`Response` handler over the
same transport-neutral dispatcher used by Express. It validates the canonical request before
deriving context, runs dispatch inside the server-owned invocation context, optionally derives a
specialized authority from that trusted context, and preserves the same `200`, `400`, `403`, and
`503` protocol semantics. Adapter failures may be reported by the host without exposing their cause
to the client.

### Completed TDD Slice: Client Read Ergonomics And Distributed Identity

Generated client Entities now author portable reads through `Entity.all()` and `Entity.where(...)`
without importing the lower-level `query(...)` factory. Many rows remain the default; terminal
`first()`, strict `one()`, `count()`, and `exists()` expressions carry result intent so React no
longer needs an explicit `mode`.

`useGraphQuery` derives Entity-prefixed cache identity from the canonical transport request and
semantic intent. `OntahiGraphProvider` adds a portable `ExecutionIdentity` consisting of a
Principal plus an optional JSON-safe application scope. That identity partitions distributed
client state across login, service, tenant, and workspace changes but is not authorization input:
the server continues to authenticate and authorize from trusted invocation context. The same
Principal type is shared by client and server invocation state.

Resolved client Operations are also first-class invocation values. Passing
`Entity.domain.operation(input)` to `useOperation` binds the latest render input and yields
zero-argument execution, while the declaration-based hook remains available for reusable
imperative mutations. Todo exercises both forms and no longer declares graph read modes or manual
query keys.

The React provider now composes the conventional same-origin Fetch graph client by default: graph
reads, Operations, task snapshots, reflected Operation invocation, and reflected Entity data share
one replaceable client capability. Hosts may override individual pieces or disable the default
entirely. Todo therefore demonstrates application-level setup as runtime identity rather than
repeating transport wiring.

The developer guide now presents caller-authored Queries as the ordinary application read path
rather than as an optional remote-read feature. It keeps Operations distinct as named domain
behavior, documents `include` as lower level than caller-owned Views, and makes the current alpha
boundaries explicit: remote policy authoring and distributed execution identity may evolve, remote
Commands remain unsupported, and client defaults never replace server authentication or policy.

The next Ontahi read slice should finish runtime binding and topology evidence before remote
Commands. That keeps execution and result semantics visible without mixing in write authority or
cache reconciliation at the same time.

1. Bind generated browser Entities to the configured remote runtime when fluent client-side
   `.run()` execution is needed outside the React executor.
2. Prove the Todo browser read path against the PostgreSQL storage topology in addition to the
   current in-memory integration proof.
3. Expose execution topology, policy decision, cache identity, and failure diagnostics to telemetry
   and reflection.

Remote insert, update, upsert, and delete remain explicitly outside this first pull. They reuse the
protocol/runtime shape only after the read boundary demonstrates a credible authority model.

## Acceptance Checklist

- [x] One canonical read program validates and round-trips without executable JavaScript or
      provider-specific query state.
- [x] Direct and remote runtimes execute the same Todo read expression with the same semantic
      result.
- [x] The server dispatcher is transport-neutral and the Express HTTP adapter is replaceable.
- [x] Remote reads are denied unless an explicit graph policy permits their semantic surface.
- [x] Invalid, oversized, unsupported, and unauthorized programs return structured failures.
- [x] Tests cover protocol versioning, AST validation, policy enforcement, runtime routing, and the
      end-to-end Todo proof.
- [x] Remote Commands remain unavailable by default and are left for the next bounded slice.

## Open Questions

1. Is policy declared primarily per Entity, per application graph segment, or as composable policy
   capabilities?
2. How are authority-derived row scopes intersected with inserts and upserts?
3. Which constraints require a Domain Operation rather than a permitted direct Command?
4. Can one reflect policy without leaking fields or population facts the caller cannot observe?
5. How should optimistic updates reconcile when a remote policy narrows the affected Selection?
6. What protocol versioning rules preserve saved Selections and cached Query identities?
7. Should a client choose execution topology explicitly, or only receive a preconfigured bound
   runtime?

## Decisions

1. A Domain Operation is domain behavior, not a required transport wrapper.
2. Selection, Query, and Command are provider-neutral programs before they are execution requests.
3. Runtime binding chooses direct versus remote execution without changing call-site semantics.
4. Remote graph access is policy-controlled and default-deny; it is not an arbitrary RPC or SQL
   endpoint.
5. Authority and policy are independent from transport, while enforcement occurs at the
   authoritative boundary.
6. Direct and bridged execution must preserve one semantic result and failure model.
7. Entity registration and remote exposure are separate concerns; authority-derived owner or
   tenant scope can narrow an explicitly exposed surface but cannot create exposure by itself.
8. Policy has one canonical semantic representation, while authoring ergonomics are layered and
   compile into it; application colocation does not make policy intrinsic to the Entity ontology.
9. Runtime authoring remains unified while delivery is incremental; unavailable stream and Command
   capabilities fail explicitly rather than creating temporary read-only runtime abstractions.
10. Express is the first HTTP reference adapter; Next.js must reuse its dispatcher, authority, and
    protocol-status semantics rather than define a framework-specific graph bridge.
11. Read-only wrapper Operations are removed once the caller can execute the same Query through its
    configured runtime; Operations remain for domain intent, invariants, capabilities, writes, and
    durable behavior.

## Completion Signal

This plan is ready to pull. Its first completion signal is narrower than the full direction: a
reviewable read protocol, credible default-deny read policy, and Todo proof in which the same client
read code runs through both direct and remote storage topologies without wrapper Operations.
