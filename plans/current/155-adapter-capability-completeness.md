# 155. Adapter Capability Completeness

Status: current

Canonical ID: `ontahi://plans/155-adapter-capability-completeness`

Shapes: [Durable Workflows](../../atlas/items/durable-workflows.md),
[Event](../../atlas/items/model/event.md), and
[Runtime Capability Model](../../atlas/items/application-architecture-surface/runtime-capabilities.md).

Related plans:

1. [146j. First-Class Events Runtime Protocol Gate](./146j-first-class-events-runtime-protocol-gate.md)
2. [151b. MySQL Type And Schema Conformance](../next/151b-mysql-type-and-schema-conformance.md)
3. [153c. Interactive And Resumable Operation Execution](./153c-operation-interactions-and-resumption.md)
4. [153e. Vercel Workflow Interaction Resumption](../done/153e-vercel-workflow-interaction-resumption.md)
5. [155a. Vercel Workflow Event Waits](../done/155a-vercel-workflow-event-waits.md)

## Summary

Ontahi now has provider-neutral Data Graph, Task Storage, Task Runtime, Event Runtime, Runtime
Protocol, and Event ingress boundaries. The implementations prove those boundaries unevenly:
PostgreSQL and MySQL provide Data Graph, durable Task Storage, and durable Events, while Supabase
provides Data Graph and Task Storage but no Event Runtime. Runtime hosts and task executors also
support different deliberate subsets.

This plan consolidates those adapters methodically. An adapter counts as supported for a concern
only when it exposes a public entrypoint, states honest guarantees and limits, passes a shared
behavioral contract where one exists, and has representative provider-backed evidence for durable
or concurrent behavior.

## Current Capability Matrix

| Adapter         | Data Graph                                   | Task Storage / Runtime                      | Event Runtime                   | Host / ingress             |
| --------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------- | -------------------------- |
| Core in-memory  | reference runtime and storage                | storage and in-process runtime              | ephemeral reference runtime     | transport-neutral protocol |
| PostgreSQL      | transactional storage                        | durable Task Storage and in-process runtime | durable delivery                | not applicable             |
| MySQL           | transactional storage with documented limits | durable Task Storage and in-process runtime | durable delivery                | not applicable             |
| Supabase        | PostgREST and focused RPC capabilities       | durable Task Storage through PostgREST/RPC  | missing                         | not applicable             |
| Express         | not a storage provider                       | Operation and Task observation host         | Event ingress                   | HTTP, WebSocket, Explorer  |
| Next.js         | not a storage provider                       | Operation host                              | Event ingress                   | HTTP Runtime Protocol      |
| Vercel Workflow | not applicable                               | durable executor subset                     | durable Event waits             | not applicable             |
| LangGraph       | not applicable                               | interaction-capable executor subset         | Event waits rejected explicitly | not applicable             |

The matrix is not a promise that every package implements every concern. A missing cell becomes
work only when the underlying technology can provide the contract honestly and the implementation
adds a useful composition path.

## Scope

1. Establish shared conformance suites at adapter-author boundaries that lack them.
2. Fill the highest-value persistence gaps one concern and provider at a time.
3. Exercise multi-concern package composition without coupling the concerns together.
4. Add restart, concurrency, and recovery proofs for durable claims.
5. Keep capabilities and documented limitations aligned with executable evidence.
6. Preserve incomplete executor features as explicit rejections until their semantics are proven.

## Non-Goals

1. Do not require every adapter package to implement every Ontahi concern.
2. Do not introduce a generic database client, repository abstraction, or lowest-common-denominator
   storage API.
3. Do not add broker egress, Event history, workflow products, or generalized event processing as
   part of Task Storage completion.
4. Do not claim atomic Data Graph, Task, and Event persistence merely because they share a database.
5. Do not implement Supabase Event delivery by copying PostgreSQL transaction assumptions through
   PostgREST.

## Execution Slices

### Slice 1: PostgreSQL Task Storage

- [x] Define and run a provider-neutral `TaskStorage` conformance proof.
- [x] Implement independently importable `@ontahi/postgres/tasks` storage.
- [x] Prove duplicate/missing behavior, snapshots, listing, actor scope, runtime references, and
      atomic Interaction and Event claims against PostgreSQL.
- [x] Wire Todo Express PostgreSQL mode to PostgreSQL Task Storage and Event Runtime independently.
- [x] Prove a Todo Event wait can resume after application runtime recreation.

### Slice 2: MySQL Task Storage

- [x] Implement `@ontahi/mysql/tasks` against the same conformance proof.
- [x] Prove InnoDB claim concurrency and restart recovery.
- [x] Wire the MySQL Todo mode without coupling Data Graph, Tasks, and Events at construction.

### Slice 3: Supabase Task Storage Hardening

- [x] Run the shared Task Storage proof against a real PostgREST/Supabase-compatible stack.
- [x] Replace read-then-write claims with an invoker-rights conditional-update RPC.
- [x] State RLS, grants, schema, and realtime/observation limitations explicitly.

### Slice 4: Remaining Runtime Gaps

- [ ] Evaluate Supabase durable Events as a PostgREST/RPC-owned design.
- [x] Reconcile Vercel Workflow Interaction support through its owning plan.
- [x] Preserve durable Event-wait claims through the Vercel Workflow executor.
- [ ] Re-evaluate LangGraph Event waits only when it can preserve the durable claim contract.
- [ ] Extract real ingress providers and broker/egress adapters into focused follow-up plans.

### Slice 5: Documentation And Atlas Reconciliation

- [ ] Publish a verified capability matrix with guarantees, limitations, and conformance evidence.
- [ ] Update package READMEs and canonical developer documentation from the executable matrix.
- [ ] Update the smallest Atlas items for stable adapter-author contracts.
- [ ] Close or link every remaining gap rather than leaving an ambiguous compatibility claim.

## Verification

1. Shared suites test observable contracts rather than SQL implementation details.
2. Durable providers run against real disposable databases.
3. Atomic claim tests race independent clients and accept one winner.
4. Restart tests recreate runtimes over the same storage namespace.
5. Public subpath exports pass typecheck, build, lint, artifact verification, and packed-consumer
   resolution.
6. Todo exercises the composed provider concerns without a monolithic adapter switch.

## Decisions

1. Multi-concern provider packages expose independent subpaths and factories.
2. Shared infrastructure does not imply shared lifecycle or atomicity.
3. Conformance plus provider-backed recovery evidence is required for durable compatibility claims.
4. PostgreSQL Task Storage is the first consolidation slice because it closes the missing durable
   center between the existing PostgreSQL Data Graph and Event Runtime proofs.
5. Supabase Event Runtime remains a separate design slice because PostgREST cannot inherit direct
   PostgreSQL session and transaction semantics implicitly.

## Open Questions

1. Which Task Storage operations need optimistic revision fencing beyond the two explicit claim
   operations?
2. Should Task Storage advertise capabilities such as native observation, transactional updates,
   or retention independently from Task Runtime?
3. Should direct SQL Task Storage share schema-generation helpers across PostgreSQL and MySQL, or
   is the stable boundary only the semantic conformance suite?
4. When a provider offers Data Graph, Task Storage, and Events, what explicit host API should opt
   into a shared transaction without making atomicity appear automatic?

## Closure And Evolution

This plan closes when the capability matrix is executable and documented, PostgreSQL and MySQL
provide verified Task Storage, Supabase Task Storage passes real provider conformance, and every
remaining partial cell is either an honest limitation or a linked focused plan.
