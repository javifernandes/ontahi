# Events

An \concept{Event} declares that an application fact happened. An Operation invocation asks the
application to do something; an Event Occurrence records an accepted fact after it happened. That
difference lets Events fan out to diagnostics, projections, workflows, and external consumers
without turning those consumers into hidden steps of the initiating Operation.

## Declare the fact once

An Event declaration gives the fact a stable identity, an explicit version, documentation, and a
Graph Schema payload:

```ts
import { event } from '@ontahi/core/runtime/server';
import { field, graphSchema } from '@ontahi/core/data-graph';

export const TodoListCompleted = event.define({
  id: 'TodoListCompleted',
  version: 1,
  description: 'Every incomplete item in one list was completed.',
  payload: graphSchema.object({
    list: graphSchema.ref(TodoList),
    completedCount: field.nonNegativeInteger(),
  }),
});
```

Register it in the application model:

```ts
export const TodoApplication = ontahi({
  storage,
  entities: [TodoList, TodoItem],
  events: [TodoListCompleted],
});
```

Registration validates unique identities and exposes the declaration to reflection, Explorer, and
the typed application Event API. A declaration does not name a topic, table, webhook framework, or
subscriber. Those are runtime and host choices.

Version is a positive integer and matching is exact. A consumer waiting for version 1 does not
silently accept version 2. Schema migration and cross-version delivery are deliberately outside the
current contract.

## Emit a typed intent

`event(TodoListCompleted, payload)` validates the payload, creates a JSON-safe Event Emission, and
wraps it as an Effect Intent. An Operation can return it alongside its result:

```ts
return withEffects({ completedCount }, [event(TodoListCompleted, { list, completedCount })]);
```

The built-in interpreter validates the registered declaration again and sends the emission to the
configured Event Runtime. An application does not register an `emit-event` effector for typed
Events. Raw event-shaped effect values remain a compatibility path only when the host explicitly
installs the legacy effector.

A Reaction can emit the same declaration from an Applied Mutation Outcome:

```ts
reaction
  .relationship(Course, 'students')
  .added({ id: 'course.students.assigned', delivery: 'inline' })
  .emit(StudentCourseAssigned, outcome => ({
    student: outcome.command.source,
    course: outcome.command.target!,
  }));
```

The Unit of Work journals mutation-caused emissions. Rejection or rollback discards them; a
successful transaction publishes them only after commit. Publication and subscriber failures are
post-commit evidence and cannot retroactively undo the mutation.

Prefer one intentional domain Event for one domain fact. `completeAll` emits one
`TodoListCompleted`, including when `completedCount` is zero. Ontahí does not infer one Event per
changed row. A future opt-in graph-change or operation-lifecycle Event can coexist with explicit
domain Events, but it must define aggregation and authority independently.

## Distinguish occurrence from delivery

The Event Runtime accepts an emission and creates one immutable Event Occurrence:

```ts
type EventOccurrence = {
  kind: 'event-occurrence';
  occurrenceId: string;
  eventId: string;
  eventVersion: number;
  occurredAt: string;
  payload: JsonValue;
  causation?: EventCausation;
  correlation?: Readonly<Record<string, JsonValue>>;
};
```

Each presentation to a subscriber is a distinct Event Delivery. Fan-out preserves the occurrence
identity while assigning a different `deliveryId` and `subscriptionId` to every subscriber.
Delivery attempts can change without creating another occurrence.

This distinction prevents “delivered exactly once” from being confused with “happened exactly
once.” Current runtimes make neither general exactly-once claim.

## Subscribe headlessly

The application API keeps declaration typing at the subscriber:

```ts
const subscription = TodoApplication.events.subscribe(TodoListCompleted, delivery => {
  console.info(delivery.occurrence.payload.list, delivery.occurrence.payload.completedCount);
});

subscription.cancel();
```

One subscriber failure does not prevent delivery to other subscribers or retract the accepted
occurrence. Cancellation prevents future delivery to that subscription.

The default runtime is process-local and ephemeral. It provides live subscription, acceptance-
ordered fan-out, bounded subscriber delivery time, and overflow rejection. It reports no retention,
replay, durable acceptance, durable delivery, acknowledgement, deduplication, atomic publication,
or restart guarantee.

## Select a durable Event Runtime explicitly

PostgreSQL and MySQL provide independently selectable durable Event Runtimes:

```ts
import { createPostgresEventRuntime } from '@ontahi/postgres/events';

const eventRuntime = createPostgresEventRuntime({ pool });

const application = ontahi({
  storage,
  eventRuntime,
  events: [TodoListCompleted, TodoListExportReady],
  entities: [TodoList, TodoItem],
});
```

These runtimes retain occurrences and stable subscription definitions, match an optional JSON
correlation subset, and lease delivery claims atomically. A consumer acknowledges a claim, releases
it for another attempt, or lets its lease expire. Registration also matches retained occurrences,
so occurrence-before-subscriber and subscriber-before-occurrence converge on the same delivery.

They do not provide general Event history, cursor replay, deduplication, or atomic publication with
Data Graph mutations. Sharing a database or connection pool does not make separately configured
concerns one transaction.

Adapter authors use `verifyDurableEventRuntimeConformance(...)` to prove the provider-neutral
lifecycle. Consumers use `requireDurableEventDelivery(runtime)` to fail before registering a wait
when the selected runtime lacks retention, durable acceptance and delivery, acknowledgement, or
the claim API.

## Ingest external facts without modeling an HTTP Operation

An external provider callback may be an Event rather than an Operation exposed through HTTP. The
provider adapter authenticates the original request and normalizes it; Ontahí then validates an
explicit default-deny route, declaration version, payload, correlation, and JSON safety before
creating the occurrence.

```ts
const eventRoutes = [
  {
    eventId: TodoListExportReady.id,
    eventVersion: TodoListExportReady.version,
    method: 'POST',
    route: '/events/export-ready',
    provider: 'export-worker',
    channel: 'todo.export-ready',
  },
] as const;
```

Express and Next.js project the same HTTP-neutral ingress contract. Provider delivery identity is
retained as ingress causation, not treated as application correlation or as proof of deduplication.
Rejected, ignored, unauthorized, malformed, or stale-version deliveries create no occurrence.

## Wait for an Event durably

An explicit durable Task execution can return a serializable Event wait:

```ts
return {
  kind: 'event',
  state,
  event: {
    id: `todo-list-export:${state.requestId}`,
    declaration: TodoListExportReady,
    correlation: { requestId: state.requestId },
    timeoutMs: 10 * 60 * 1_000,
  },
};
```

The checkpoint stores declaration identity, exact version, correlation, and timeout rather than a
JavaScript callback. The Event Runtime owns retained delivery; Task Storage atomically chooses the
single continuation winner. The native Task Runtime and Vercel Workflow executor implement this
contract. LangGraph rejects Event waits explicitly because its current adapter cannot preserve the
same durable claim semantics.

Timeout and cancellation end the stable waiter subscription without deleting the occurrence.
Restart recovery recreates runtimes over the same stores; it does not preserve a live stack.

## Observe Events without inventing Event history

Runtime Protocol WebSocket sessions can advertise `event-subscription-push`. `event-observe` and
`event-unobserve` controls subscribe to a registered declaration through server-owned policy and
push deliveries with observation-scoped sequence numbers. Disconnect cancels the live subscription;
there is no automatic replay or resubscription.

This browser path is intentionally live-only. It does not expose durable claims, credentials,
provider topology, a general history query, or arbitrary predicates. Explorer derives its Event
catalog and simulation form from reflected declarations. Devtools presents occurrence and delivery
beneath their causal Operation, Reaction, or ingress activity while keeping the technical envelope
available as detail.

## Keep the boundaries honest

- Event declaration and occurrence are semantic application contracts.
- Event Runtime owns acceptance and delivery guarantees.
- Runtime Protocol transports the supported live browser projection.
- Event ingress authenticates and normalizes an external delivery before acceptance.
- Task Storage arbitrates one continuation; it is not an Event store.
- Reactions schedule follow-up intents; their delivery policy is separate from Event delivery.
- Data Graph transactions do not automatically include Event acceptance.

These boundaries let a provider package implement several concerns independently. A PostgreSQL or
MySQL package can supply Data Graph storage, Task Storage, Event Runtime, or any combination without
becoming a generic database client or a monolithic Ontahí runtime.
