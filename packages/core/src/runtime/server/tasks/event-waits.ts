import { cloneJson } from '../../../value/json.js';
import type { EventDeliveryClaim, EventOccurrence } from '../events/types.js';

import type {
  TaskEventWaitRequest,
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
