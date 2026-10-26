# Semantic execution identity and context map

This artifact inventories Ontahí's implemented execution identities and scopes for
[Plan 158](../../plans/research/158-semantic-execution-context-governance-and-evidence.md).
It distinguishes existing contracts from candidate vocabulary so the first propagation proof can
join real runtime boundaries without turning a governance experiment into a universal context API.

The central finding is that Ontahí already has strong local identities for authority, transport,
durable work, interactions, commits, Events, and telemetry. What it lacks is a runtime-owned causal
identity that relates those local identities and attributes an execution to the Interaction or
surface that initiated it.

## Identity dimensions

An execution cannot be described truthfully by one undifferentiated ID. At least these dimensions
remain independent:

1. **semantic identity**: which declared Operation, Entity, Resource, Interaction kind, or Event is
   involved;
2. **execution identity**: which particular invocation, Task Run, Resource attempt, commit, or
   delivery occurred;
3. **causal identity**: which prior activity, Interaction, Event, or execution directly caused it;
4. **correlation identity**: which activities should be inspected together without claiming direct
   causation;
5. **authority identity**: which receiver-verified Principal and policy scope apply;
6. **participant identity**: which human, service, or agent requested, proposed, approved, or
   answered an Interaction;
7. **client-instance identity**: which tab, window, CLI process, agent channel, or connection
   participated;
8. **interaction origin**: which stable application surface or affordance initiated the action;
9. **commit identity**: which Unit Of Work or mutation commit establishes that effects occurred;
10. **technical trace identity**: which transport exchange, telemetry span, provider request, or
    delivery explains runtime behavior.

Several dimensions may happen to share a value in a small application. They do not thereby become
the same concept. In particular, a request ID is not an Operation Run, a WebSocket connection is not
an authenticated Session, and a browser tab is not an authority credential.

## Implemented inventory

| Current identity or scope              | Generation and trust owner                                                        | Lifetime and propagation                                                                                         | Current consumers                                                                 | Finding                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Principal { subject, kind, issuer? }` | Host authentication through receiver-owned invocation context                     | One top-level invocation; inherited by nested server work unless explicitly replaced by trusted host composition | authorization, execution cache partitioning, Task trigger actor                   | Implemented authority identity; not a login Session ID                                                                       |
| `ExecutionIdentity.cacheScope`         | Host-supplied JSON value                                                          | Invocation context; inherited unless host replaces it                                                            | Ref resolution and client/runtime cache partitioning                              | Partition key, not permission or causal identity                                                                             |
| invocation `resources` map             | Runtime creates it at a top-level invocation; nested contexts normally inherit it | One invocation/Unit Of Work family, with explicit isolated child scopes                                          | transactions, Ref resolution, memoization, mutation journal, runtime capabilities | Implemented ambient scope but intentionally has no portable public ID                                                        |
| Operation declaration `scope`          | Ontahí from the declared Operation ID                                             | During permission and execution effects                                                                          | concerns, rate limiting, telemetry naming, reporting                              | Semantic Operation identity, not a particular Operation Run                                                                  |
| Operation runtime context              | Ontahí from the runner                                                            | Nested async execution; resources normally inherited                                                             | concerns, telemetry, input/extra diagnostics, Unit Of Work                        | Implemented ambient context but contains no execution/correlation/causation identity                                         |
| Runtime Protocol envelope `id`         | Caller chooses; receiver validates shape and echoes it                            | One request/response exchange                                                                                    | multiplexing, cancellation, response/error matching                               | Untrusted exchange correlation; must not become authority or accounting ownership                                            |
| Runtime Protocol session frame `id`    | Caller chooses                                                                    | One observation/subscription within a live protocol connection                                                   | graph observation, durable-run observation, Event delivery routing                | Subscription-local routing identity; the connection itself has no portable stable Session ID                                 |
| `TaskRunIdentity { taskId, runId }`    | Task runtime; callers may supply a run ID where the trusted API permits it        | Durable run across waits, resumes, adapters, processes, and observations                                         | storage, workflows, Explorer, Runtime Protocol, model command                     | Strong implemented execution identity; currently the closest thing to a durable Operation Run                                |
| `TaskTrigger`                          | Trusted caller/runtime when the run starts                                        | Persisted with the Task Run                                                                                      | actor filtering, provenance, ingress diagnostics                                  | Already separates cause, actor, ingress, parent run, and external source, but is not propagated as a general causal envelope |
| pending Interaction `id`               | Task runtime or task definition                                                   | From presentation until response, expiry, replacement, or terminal run state                                     | response matching and durable resume                                              | Strong Interaction instance identity inside a Task Run                                                                       |
| Interaction response actor             | Receiver supplies `TaskInteractionResponseContext.actor`                          | One response attempt                                                                                             | claimant/actor validation before durable continuation                             | Participant evidence exists, but surface/client provenance is absent                                                         |
| mutation commit ID                     | Ontahí creates it after a committed mutation set exists                           | One terminal committed mutation delivery                                                                         | response metadata and active observation invalidation                             | Strong commitment identity; does not identify the initiating execution                                                       |
| Event occurrence ID                    | Event runtime                                                                     | One accepted occurrence, possibly across durable delivery attempts                                               | subscriptions, waits, replay/delivery                                             | Strong Event identity with optional typed causation and open correlation values                                              |
| Event delivery/claim IDs               | Event runtime                                                                     | One subscription delivery attempt/lease                                                                          | acknowledgement, retry, resume evidence                                           | Technical delivery identities distinct from the Event occurrence                                                             |
| telemetry trace/span identity          | Telemetry adapter                                                                 | Adapter-defined trace lifetime                                                                                   | OpenTelemetry and runtime diagnostics                                             | Technical correlation exists externally but is not an Ontahí semantic identity contract                                      |
| `ModelResourceUsage` record            | Provider adapter reports measurements                                             | One provider invocation, then accumulated into a model command result                                            | model-backed Operation reporting, model command response, Devtools                | Usage evidence has provider/model and measurements, but no attempt ID or semantic owner                                      |

### Evidence locations

- [`runtime/identity.ts`](../../packages/core/src/runtime/identity.ts) defines Principal and cache
  partition identity.
- [`invocation-context.ts`](../../packages/core/src/runtime/server/invocation-context.ts) establishes
  receiver-owned ambient invocation context and resource inheritance.
- [`context-types.ts`](../../packages/core/src/runtime/server/context-types.ts) shows that current
  Operation context is scope/telemetry/input/resources rather than a causal identity envelope.
- [`protocol/envelope.ts`](../../packages/core/src/runtime/protocol/envelope.ts) defines the
  caller-authored exchange ID and receiver-owned response metadata.
- [`runtime/contracts.ts`](../../packages/core/src/runtime/contracts.ts) defines Task Run, trigger,
  Interaction, claimant, and model usage records.
- [`unit-of-work.ts`](../../packages/core/src/runtime/server/unit-of-work.ts) creates committed
  mutation identity and owns invocation-local runtime resources.
- [`events/types.ts`](../../packages/core/src/runtime/server/events/types.ts) distinguishes Event
  occurrence, causation, correlation, delivery, and claim identities.

## Current relationship map

```text
receiver-authenticated Principal
  └─ InvocationContext
      ├─ cacheScope
      └─ resources / Unit Of Work family
          └─ OperationRuntimeContext(scope = declared Operation)
              ├─ telemetry span (adapter-owned identity)
              ├─ optional TaskRun(taskId, runId)
              │   ├─ persisted TaskTrigger
              │   └─ pending Interaction(id)
              ├─ committed mutation set + mutationCommitId
              │   └─ optional declared Event occurrence
              └─ model provider call
                  └─ ModelResourceUsage (no attempt identity today)

Runtime Protocol connection
  ├─ exchange id (caller-authored)
  └─ observation id (caller-authored, connection-local)
```

The diagram describes possible containment, not guaranteed propagation. Today the Principal and
resource map flow through much of server execution, and a Task Run retains its own trigger and
Interaction. The exchange ID, Task Run, mutation commit, Event occurrence, telemetry span, and model
usage record are not consistently related by one causal contract.

## Missing origin and client context

One declared Operation can be initiated through materially different Interactions:

```text
TodoList.addItem
  ├─ explicit Add button
  ├─ accepted autocomplete suggestion
  ├─ model-command chat
  ├─ agent-proposed action
  └─ CLI command
```

The Operation contract and input can remain identical while debugging, product correctness, audit
policy, and interaction evaluation need to know how this run originated. That provenance should not
be encoded in the Operation input and should not use framework implementation names such as React
component paths.

A candidate stable origin projection is:

```ts
type InteractionOrigin = {
  channel: 'web' | 'cli' | 'agent' | 'api' | 'system';
  interactionKind?: string;
  surface?: string;
  clientInstanceId?: string;
};
```

Examples of stable application-owned values are `todo-item-autocomplete`, `command-chat`, and
`todo-list-add-form`. DOM IDs, CSS selectors, component stack paths, URLs containing private data,
and arbitrary labels are diagnostics rather than semantic surface identity.

The trust rules differ per field:

| Field              | Meaning                                               | Trust and authority rule                                                             |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `channel`          | broad ingress/presentation class                      | receiver normalizes it from the bound transport or trusted adapter where possible    |
| `interactionKind`  | stable kind of request or response                    | application declaration or trusted Interaction runtime owns it                       |
| `surface`          | stable application affordance or presentation surface | client may claim it; receiver treats it as provenance, not authority                 |
| `clientInstanceId` | tab/process/agent instance                            | client-generated and bounded; never grants authority or chooses accounting ownership |

Client origin can be absent, falsified, stale, or high-cardinality. It is useful for traceability and
interaction correctness only when its evidentiary quality remains explicit. A host may replace or
augment it with trusted gateway/connection evidence.

## Trust classes

The propagation proof should classify every field rather than marking the whole context trusted:

1. **receiver-asserted**: Principal, effective authority scope, selected policy, server execution
   identity, admitted Resource binding;
2. **runtime-generated**: Task Run, Interaction, Resource attempt, mutation commit, Event occurrence,
   telemetry linkage;
3. **client-claimed**: client instance, surface, local interaction occurrence, caller request ID;
4. **provider-reported**: model identity, provider request details, tokens, cache/reasoning classes;
5. **derived**: normalized channel, semantic owner, parent/child relationship, aggregate usage.

No client-claimed or provider-reported field may replace receiver-asserted authority. Derivation must
preserve its sources so Devtools and policy explanations do not present weak evidence as verified
identity.

## Candidate causal core

The first implementation should test a small internal core rather than export the full imagined
context:

```ts
type SemanticExecutionLink = {
  executionId: string;
  correlationId: string;
  causationId?: string;
  parentExecutionId?: string;
};
```

Provisional meanings:

- `executionId` identifies one runtime activity whose outcome can be discussed independently;
- `correlationId` groups a top-level causal family for inspection;
- `causationId` identifies the immediately preceding activity that caused this activity;
- `parentExecutionId` expresses structural nesting when it differs from causal provenance.

The distinction matters. An Operation can be structurally nested inside another Operation while an
Interaction response is its direct cause. A retry is another Resource-attempt execution caused by a
failed attempt, still correlated with one Operation Run. Correlation must never imply authorization,
atomicity, or exactly-once execution.

The core should be composed with projections, not expanded into one public bag:

```ts
type OperationEvidenceContext = SemanticExecutionLink & {
  operationId: string;
  operationRunId?: string;
  principal?: Principal;
  origin?: InteractionOrigin;
};

type ResourceAttemptContext = SemanticExecutionLink & {
  owner: { kind: 'operation' | 'intent-resolution'; id: string; runId?: string };
  attemptId: string;
  binding?: string;
};
```

These examples are research notation. They do not select exported names, field optionality, ID
format, storage, or a TypeScript inheritance hierarchy.

## Lifecycle and cardinality

| Relationship                                  | Expected cardinality                                              | Important exception                                                               |
| --------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| authenticated Session → Principal             | many Sessions may represent one Principal                         | service/system execution may have no human login Session                          |
| Principal → client instance                   | many                                                              | anonymous clients also exist                                                      |
| client instance → Runtime Protocol connection | zero or many over time                                            | reconnect must not create authority or silently become a new semantic Interaction |
| Interaction → Operation Run                   | zero, one, or many                                                | a proposal may be rejected; one accepted batch may launch several Operations      |
| Operation Run → Task Run                      | zero or one in current durable path                               | immediate Operations currently lack a first-class run identity                    |
| Operation Run → Resource attempt              | zero or many                                                      | retry/fallback attempts are charged and observed independently                    |
| execution → Unit Of Work                      | one active scope at a time                                        | a child transaction establishes a nested isolated scope                           |
| Unit Of Work → mutation commit                | zero or one terminal delivered commit per current invocation path | rollback creates no committed mutation identity                                   |
| mutation/Operation → Event occurrence         | zero or many declared Events                                      | runtime evidence must not automatically become Domain Events                      |
| Event occurrence → delivery attempt           | zero or many                                                      | delivery identity is not occurrence identity                                      |

## Safe projections

Different consumers need different subsets of the same causal family:

| Consumer             | Required context                                                                               | Excluded by default                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| authorization        | verified Principal, semantic subject, trusted application scope                                | client surface as a permission grant, provider usage                    |
| Resource governance  | semantic owner, attempt, effective policy/accounting scope, verified Principal when applicable | prompt/result content, arbitrary caller accounting owner                |
| Devtools             | correlation, semantic owner, safe origin, run/attempt IDs, outcome, redacted measurements      | credentials, raw prompts/results, private Entity values                 |
| telemetry adapter    | trace linkage, semantic subject, runtime/transport attributes, outcome                         | complete audit payload and durable-retention promises                   |
| audit sink           | policy-selected verified identity, subject, action, decision, outcome                          | unselected diagnostics and unrestricted client/provider claims          |
| Domain Event adapter | declared Event, occurrence, typed causation/correlation                                        | automatic mirror of every execution or policy decision                  |
| model context        | only explicitly disclosed domain/user context                                                  | Principal internals, budgets, accounting owner, private causal envelope |

## First propagation proof

The smallest useful implementation can now be bounded to one top-level model command and one
model-backed Operation:

1. generate an internal execution/correlation link at trusted server ingress when none exists;
2. preserve it through Runtime Protocol dispatch, invocation context, Task Run execution, and
   Operation runtime composition without accepting client-authored authority;
3. attach a safe origin claim for command chat versus Todo autocomplete or explicit action;
4. create a distinct attempt identity for every provider call;
5. report model usage with `owner`, `attemptId`, and correlation while preserving the existing
   provider-neutral measurements;
6. render the relationship in Devtools as bounded diagnostic evidence;
7. verify that two tabs sharing one Principal remain distinguishable and that spoofing a tab/surface
   cannot alter permission, cache ownership, or Resource accounting scope;
8. verify that retry produces two attempts correlated to one semantic run rather than one merged
   uncharged usage record.

The proof should not add durable audit storage, general quotas, pricing, a public universal context,
or a mandatory client identifier. It should finish by deciding which link belongs in Runtime
Protocol metadata, which remains server-internal, and which projections are safe public contracts.

## Decisions and unresolved points

This inventory supports the following decisions:

1. build a causal context facility that can serve governance, debugging, interaction correctness,
   observability, audit, and distributed execution rather than a model-accounting-only context;
2. retain distinct identities and expose purpose-specific projections;
3. treat UI/CLI origin as useful provenance with explicit trust, not Operation input or authority;
4. reuse Task Run, Interaction, mutation commit, Event, and transport identities rather than minting
   aliases for them;
5. give immediate Operations and Resource attempts missing runtime identities only through the
   bounded propagation proof.

The proof still needs to resolve:

1. whether `executionId` begins at server ingress, semantic dispatch, or both through parent/child
   activities;
2. whether a Runtime Protocol request `id` is linked as transport evidence or can safely seed a
   server-normalized correlation ID;
3. how causal links survive durable Task resume and remote runtime delegation;
4. whether OpenTelemetry trace context is a projection of semantic correlation or an independently
   linked technical trace;
5. whether an Operation Run identity should exist for every immediate Operation or only when a
   consumer requires it;
6. where bounded client-origin declarations live and how generated clients expose them without UI
   framework coupling.
