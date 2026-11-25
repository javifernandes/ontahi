import { Effect } from 'effect';

import { cloneJson } from '../../../value/json.js';
import type { EventDeliveryClaim, EventOccurrence, EventRuntime } from '../events/types.js';

import type {
  TaskEventWaitRequest,
  TaskExecutionCheckpoint,
  TaskRunSource,
  TaskStorage,
  TaskFailure,
  TaskPendingEventWait,
  TaskEventResume,
  TaskRunIdentity,
} from './types.js';

let fallbackWaitIdSequence = 0;

const createWaitId = () =>
  globalThis.crypto?.randomUUID() ?? `event-wait-${Date.now()}-${++fallbackWaitIdSequence}`;

export const materializeTaskEventWait = (
  ref: TaskRunIdentity,
  request: TaskEventWaitRequest,
  registeredDeclarations: ReadonlyMap<string, unknown>,
): TaskPendingEventWait => {
  const registered = registeredDeclarations.get(request.declaration.id);
  if (registered !== request.declaration) {
    throw {
      reason: 'task_event_not_registered',
      message: `Event ${request.declaration.id}@${request.declaration.version} is not registered for Task waits.`,
      ...ref,
      eventId: request.declaration.id,
      eventVersion: request.declaration.version,
    } satisfies TaskFailure;
  }
  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw {
      reason: 'task_event_wait_invalid',
      message: 'Task Event wait timeoutMs must be a positive finite number.',
      ...ref,
    } satisfies TaskFailure;
  }

  const createdAt = new Date();

  return {
    id: request.id ?? createWaitId(),
    kind: 'event',
    eventId: request.declaration.id,
    eventVersion: request.declaration.version,
    ...(request.correlation ? { correlation: cloneJson(request.correlation) } : {}),
    createdAt: createdAt.toISOString(),
    ...(request.timeoutMs === undefined
      ? {}
      : { timeoutAt: new Date(createdAt.getTime() + request.timeoutMs).toISOString() }),
  };
};

export const eventWaitMatchesOccurrence = (
  wait: TaskPendingEventWait,
  occurrence: EventOccurrence,
) =>
  wait.eventId === occurrence.eventId &&
  wait.eventVersion === occurrence.eventVersion &&
  Object.entries(wait.correlation ?? {}).every(
    ([key, value]) => JSON.stringify(occurrence.correlation?.[key]) === JSON.stringify(value),
  );

export const taskEventWaitSubscriptionId = (ref: TaskRunIdentity, waitId: string) =>
  `task:${ref.taskId}:${ref.runId}:event-wait:${waitId}`;

export const createTaskEventResume = (
  wait: TaskPendingEventWait,
  claim: EventDeliveryClaim,
): TaskEventResume => ({
  kind: 'event',
  waitId: wait.id,
  eventId: claim.delivery.occurrence.eventId,
  eventVersion: claim.delivery.occurrence.eventVersion,
  occurrenceId: claim.delivery.occurrence.occurrenceId,
  occurredAt: claim.delivery.occurrence.occurredAt,
  deliveryId: claim.delivery.deliveryId,
  subscriptionId: claim.delivery.subscriptionId,
  attempt: claim.delivery.attempt,
  claimId: claim.claimId,
  consumerId: claim.consumerId,
  leaseExpiresAt: claim.leaseExpiresAt,
  ...(claim.delivery.occurrence.causation?.kind === 'ingress'
    ? {
        ingress: {
          provider: claim.delivery.occurrence.causation.provider,
          receivedAt: claim.delivery.occurrence.causation.receivedAt,
          ...(claim.delivery.occurrence.causation.event
            ? { event: claim.delivery.occurrence.causation.event }
            : {}),
          ...(claim.delivery.occurrence.causation.deliveryId
            ? { deliveryId: claim.delivery.occurrence.causation.deliveryId }
            : {}),
        },
      }
    : {}),
});

export const requireTaskEventDelivery = (runtime: EventRuntime | undefined) => {
  if (
    !runtime?.durableDelivery ||
    !runtime.capabilities.retention ||
    !runtime.capabilities.durableAcceptance ||
    !runtime.capabilities.durableDelivery ||
    !runtime.capabilities.acknowledgement
  ) {
    throw new TypeError('A durable Event Runtime with retention and acknowledgement is required.');
  }
  return runtime.durableDelivery;
};

export const createTaskEventCheckpoint = (
  checkpoint: TaskExecutionCheckpoint,
  wait: TaskPendingEventWait,
  claim: EventDeliveryClaim,
): TaskExecutionCheckpoint => ({
  version: 1,
  state: checkpoint.state,
  eventOccurrence: cloneJson(claim.delivery.occurrence),
  eventResume: createTaskEventResume(wait, claim),
});

/** Run one Event poll under the worker's exclusive Task claim. */
export const pollTaskEventWait = async (
  storage: TaskStorage,
  source: TaskRunSource,
  runtime: EventRuntime | undefined,
) => {
  const checkpoint = source.checkpoint;
  const wait = checkpoint?.eventWait;
  if (!wait) return undefined;
  const delivery = requireTaskEventDelivery(runtime);
  const subscriptionId = taskEventWaitSubscriptionId(source, wait.id);
  if (wait.timeoutAt && Date.parse(wait.timeoutAt) <= Date.now()) {
    const snapshot = await Effect.runPromise(
      storage.cancelEvent(source, wait.id, 'failed', {
        code: 'task_event_wait_timed_out',
        message: `Timed out waiting for Event ${wait.eventId}@${wait.eventVersion}.`,
      }),
    );
    await delivery.cancel(subscriptionId);
    return snapshot;
  }

  await delivery.register({
    id: subscriptionId,
    eventId: wait.eventId,
    eventVersion: wait.eventVersion,
    ...(wait.correlation ? { correlation: wait.correlation } : {}),
  });
  const claim = await delivery.claim(subscriptionId, {
    consumerId: `task-runtime:${source.taskId}:${source.runId}`,
    leaseMs: 1_000,
  });
  if (!claim) return undefined;
  if (!eventWaitMatchesOccurrence(wait, claim.delivery.occurrence)) {
    await delivery.release(claim);
    return undefined;
  }

  const next = createTaskEventCheckpoint(checkpoint, wait, claim);
  const snapshot = await Effect.runPromise(storage.claimEvent(source, wait.id, next));
  if (!snapshot) {
    const latest = await Effect.runPromise(storage.loadSource(source));
    if (latest.status === 'waiting' && latest.checkpoint?.eventWait?.id === wait.id) {
      await delivery.release(claim);
    } else {
      await delivery.cancel(subscriptionId);
    }
  }
  return snapshot;
};

/** Settle the delivery recorded by the Task before running its continuation. */
export const settleTaskEventCheckpoint = async (
  checkpoint: TaskExecutionCheckpoint | undefined,
  runtime: EventRuntime | undefined,
) => {
  const resume = checkpoint?.eventResume;
  const occurrence = checkpoint?.eventOccurrence;
  if (!resume || !occurrence) return;
  const delivery = requireTaskEventDelivery(runtime);
  await delivery
    .acknowledge({
      claimId: resume.claimId,
      consumerId: resume.consumerId,
      leaseExpiresAt: resume.leaseExpiresAt,
      delivery: {
        kind: 'event-delivery',
        deliveryId: resume.deliveryId,
        subscriptionId: resume.subscriptionId,
        attempt: resume.attempt,
        occurrence,
      },
    })
    .catch(() => {
      // A previous worker may already have acknowledged the claim, or its lease may have expired.
      // The persisted checkpoint is authoritative. Cancel routing before continuing.
    });
  await delivery.cancel(resume.subscriptionId);
};
