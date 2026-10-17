# Adapter Capability Matrix

Ontahí adapters implement explicit concerns, not technology logos. A provider package may contain
several implementations because one technology can satisfy several application needs. Each
implementation is selected independently, advertises its own guarantees, and must not imply a
shared transaction merely because another implementation uses the same infrastructure.

## Verified implementations

| Adapter              | Data Graph                                                                               | Task Storage / execution                                                                 | Events                                                        | Host / transport                              |
| -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Core in-memory       | Complete reference execution, process-local state, compositional transaction unavailable | In-memory Task Storage and native in-process executor; process-local observation         | Ephemeral live Event Runtime                                  | Transport-neutral Runtime Protocol receiver   |
| PostgreSQL           | Transactional SQL execution and compositional Data Graph transactions                    | Durable Task Storage; native in-process execution composes separately                    | Retained occurrences and leased durable delivery              | Not applicable                                |
| MySQL 8.4 / InnoDB   | Transactional SQL execution with documented driver/schema limits                         | Durable Task Storage; native in-process execution composes separately                    | Retained occurrences and leased durable delivery              | Not applicable                                |
| Supabase / PostgREST | Graph reads and focused invoker-rights mutation RPCs; no compositional transaction       | Durable Task Storage and atomic Interaction/Event-wait claim RPCs; no native observation | Not implemented                                               | Not applicable                                |
| Express              | Uses the composed application runtime                                                    | Operation and Task observation host                                                      | Live browser subscription and authenticated Event ingress     | HTTP and WebSocket Runtime Protocol, Explorer |
| Next.js App Router   | Uses an injected receiver/dispatcher                                                     | Operation and Runtime Protocol HTTP host                                                 | Authenticated Event ingress                                   | Fetch Runtime Protocol Route Handler          |
| Vercel Workflow      | Uses host-provided execution context                                                     | Explicit durable Task executor with Interaction resumption                               | Durable Event waits through an injected durable Event Runtime | Not a general HTTP host                       |
| LangGraph            | Uses host-provided execution context                                                     | Explicit Task executor with Interaction resumption and checkpoint recovery               | Event waits rejected explicitly                               | Not a general HTTP host                       |

The matrix is descriptive, not additive. Installing `@ontahi/postgres` does not enable every column.
The host imports and configures `@ontahi/postgres`, `@ontahi/postgres/tasks`, and
`@ontahi/postgres/events` independently. MySQL follows the same shape.

## What counts as support

An adapter supports a concern when all of these are true:

1. it has a public package entrypoint;
2. its capabilities and limitations match runtime behavior;
3. it passes the shared behavioral conformance suite when one exists;
4. durable or concurrent claims have provider-backed evidence;
5. its physical schema, credentials, migrations, and lifecycle remain host-owned;
6. packed artifacts expose the documented entrypoint to an external consumer.

Using a compatible method name or backing technology is not enough. An adapter that cannot
preserve a required semantic guarantee rejects the capability instead of emulating it through a
race-prone read followed by a write.

## Concern boundaries

### Data Graph

Data Graph storage interprets portable Selections, Queries, Commands, Relations, and reflection.
The in-memory, PostgreSQL, MySQL, and Supabase adapters implement different honest subsets.
PostgreSQL and MySQL can supply a transaction-scoped runtime; Supabase cannot share rollback across
separate PostgREST requests.

### Task Storage and Task Runtime

Task Storage owns private execution checkpoints and public Task snapshots. Core's shared
conformance suite covers duplicate and missing behavior, listing, actor scope, runtime recreation,
and exclusive Interaction and Event-wait claims. PostgreSQL, MySQL, and Supabase pass that boundary
with conditional database writes. A Task Runtime is a separate executor choice and can use any
compatible Task Storage.

Task writes are not automatically atomic with Data Graph mutations or Event acceptance.

### Event Runtime

Core supplies the ephemeral reference runtime. PostgreSQL and MySQL pass the durable Event Runtime
conformance suite with retained occurrences, stable subscriptions, correlation matching, leased
claims, acknowledgement, release, stale-claim fencing, and restart recovery.

Neither SQL adapter currently advertises cursor replay, general history, deduplication, or atomic
Data Graph/Event publication. Supabase has no Event Runtime: its Task Storage can persist an Event
wait checkpoint, but resumption still requires a separately configured durable Event Runtime.

### Hosts, ingress, and transport

Express and Next.js project Core contracts into framework-native HTTP boundaries. They do not own
application declarations or authorize requests by default. Express additionally owns the Node
WebSocket lifecycle required for Runtime Protocol observations. Event ingress is a separate,
default-deny route that gives the provider the unmodified native request for authentication and
normalization.

### External executors

Vercel Workflow and LangGraph adapt explicit Task execution while Task Storage remains the public
lifecycle authority. Provider workflow IDs, hooks, checkpoint commands, and interrupt payloads stay
private. Both support Interaction resumption. Vercel Workflow additionally preserves durable Event
wait semantics; LangGraph rejects that transition until it can prove the same delivery and atomic
Task-claim contract.

## Compose concerns independently

One host can intentionally share infrastructure without coupling constructors:

```ts
const storage = createPostgresDataGraphStorage({ pool });
const taskStorage = createPostgresTaskStorage({ pool });
const eventRuntime = createPostgresEventRuntime({ pool });

const application = ontahi({
  storage,
  tasks: inProcessTasks({ storage: taskStorage }),
  eventRuntime,
  events,
  entities,
});
```

The same application could pair PostgreSQL graph storage with MySQL Task Storage, an in-memory
Event Runtime, or another conforming implementation. Shared infrastructure is an operational
choice. Cross-concern atomicity requires a separate explicit contract and is not inferred.

## Adapter-author checklist

Before claiming compatibility:

1. identify the exact Ontahí concern and public port;
2. implement only guarantees the provider can preserve;
3. expose a focused entrypoint and capability descriptor;
4. run the relevant provider-neutral conformance verifier;
5. add real-provider concurrency and restart tests for durable state;
6. document schema, migration, grant, RLS, cleanup, and observation ownership;
7. verify the packed package from a clean consumer;
8. record unsupported behavior as an explicit rejection or limitation.

This is the community extension boundary. An adapter may implement a database, queue, workflow
engine, transport, or UI projection without reimplementing the whole framework and without erasing
the provider's meaningful semantics.
