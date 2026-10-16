import { requireDurableEventDelivery, type EventOccurrence } from '@ontahi/core/runtime/server';
import {
  createTaskEventResume,
  eventWaitMatchesOccurrence,
  materializeTaskEventWait,
  taskEventWaitSubscriptionId,
  type TaskEventWaitRequest,
  type TaskExecutionState,
  type TaskFailure,
  type TaskRunIdentity,
  type TaskStorage,
} from '@ontahi/core/runtime/server/tasks';
import { cloneJson } from '@ontahi/core/value/json';
import { Effect } from 'effect';

import type { VercelWorkflowTaskEvents } from './contracts.js';

type EventWaitStore = Pick<TaskStorage, 'loadSource' | 'update' | 'claimEvent' | 'cancelEvent'>;

type EventWaitResult =
  | { readonly kind: 'resumed'; readonly occurrence: EventOccurrence }
  | { readonly kind: 'stopped' };

const EVENT_WAIT_POLL_INTERVAL_MS = 1_000;

const runTaskEffect = async <TValue>(effect: Effect.Effect<TValue, TaskFailure>) => {
  const result = await Effect.runPromise(effect.pipe(Effect.either));
  if (result._tag === 'Left') throw result.left;
  return result.right;
};

const unavailableFailure = (ref: TaskRunIdentity, error: unknown): TaskFailure => ({
  reason: 'task_event_runtime_unavailable',
  message: error instanceof Error ? error.message : String(error),
  ...ref,
});

export const waitForVercelWorkflowEvent = async ({
  ref,
  state,
  request,
  store,
  events,
  sleep,
  now = () => Date.now(),
}: {
  ref: TaskRunIdentity;
  state: TaskExecutionState;
  request: TaskEventWaitRequest;
  store: EventWaitStore;
  events: VercelWorkflowTaskEvents;
  sleep(milliseconds: number): Promise<void>;
  now?: () => number;
}): Promise<EventWaitResult> => {
  const declarations = new Map(
    events.declarations.map(declaration => [declaration.id, declaration]),
  );
  const materializedWait = materializeTaskEventWait(ref, request, declarations);
  const initialSource = await runTaskEffect(store.loadSource(ref));
  if (
    initialSource.status !== 'queued' &&
    initialSource.status !== 'running' &&
    initialSource.status !== 'waiting'
  ) {
    return { kind: 'stopped' };
  }
  const pendingWait =
    initialSource.status === 'waiting' ? initialSource.checkpoint?.eventWait : undefined;
  if (
    pendingWait &&
    (pendingWait.eventId !== materializedWait.eventId ||
      pendingWait.eventVersion !== materializedWait.eventVersion ||
      (request.id !== undefined && pendingWait.id !== request.id) ||
      JSON.stringify(pendingWait.correlation ?? {}) !==
        JSON.stringify(materializedWait.correlation ?? {}))
  ) {
    throw {
      reason: 'task_event_wait_mismatch',
      message: 'Persisted Task Event wait does not match the current execution transition.',
      ...ref,
    } satisfies TaskFailure;
  }
  const wait = pendingWait ?? materializedWait;
  let delivery;
  try {
    delivery = requireDurableEventDelivery(events.runtime);
  } catch (error) {
    throw unavailableFailure(ref, error);
  }
  const subscriptionId = taskEventWaitSubscriptionId(ref, wait.id);
  const consumerId = `task-runtime:${ref.taskId}:${ref.runId}`;
  const retry = async <TValue>(operation: () => Promise<TValue>): Promise<TValue> => {
    try {
      return await operation();
    } catch {
      await sleep(EVENT_WAIT_POLL_INTERVAL_MS);
      return retry(operation);
    }
  };
  await retry(() =>
    delivery.register({
      id: subscriptionId,
      eventId: wait.eventId,
      eventVersion: wait.eventVersion,
      ...(wait.correlation ? { correlation: wait.correlation } : {}),
    }),
  );
  if (!pendingWait) {
    await runTaskEffect(
      store.update(ref, {
        status: 'waiting',
        checkpoint: { version: 1, state: cloneJson(state), eventWait: wait },
      }),
    );
  }

  const poll = async (): Promise<EventWaitResult> => {
    const source = await runTaskEffect(store.loadSource(ref));
    if (source.status !== 'waiting' || source.checkpoint?.eventWait?.id !== wait.id) {
      await retry(() => delivery.cancel(subscriptionId));
      return { kind: 'stopped' };
    }
    if (wait.timeoutAt && Date.parse(wait.timeoutAt) <= now()) {
      await runTaskEffect(
        store.cancelEvent(ref, wait.id, 'failed', {
          code: 'task_event_wait_timed_out',
          message: `Timed out waiting for Event ${wait.eventId}@${wait.eventVersion}.`,
        }),
      );
      await retry(() => delivery.cancel(subscriptionId));
      return { kind: 'stopped' };
    }

    let claim;
    try {
      claim = await delivery.claim(subscriptionId, { consumerId, leaseMs: 1_000 });
    } catch {
      await sleep(EVENT_WAIT_POLL_INTERVAL_MS);
      return poll();
    }
    if (!claim) {
      await sleep(EVENT_WAIT_POLL_INTERVAL_MS);
      return poll();
    }
    if (!eventWaitMatchesOccurrence(wait, claim.delivery.occurrence)) {
      await retry(() => delivery.release(claim));
      await sleep(EVENT_WAIT_POLL_INTERVAL_MS);
      return poll();
    }

    const checkpoint = {
      version: 1 as const,
      state: cloneJson(state),
      eventOccurrence: cloneJson(claim.delivery.occurrence),
      eventResume: createTaskEventResume(wait, claim),
    };
    const snapshot = await runTaskEffect(store.claimEvent(ref, wait.id, checkpoint));
    if (!snapshot) {
      const latest = await runTaskEffect(store.loadSource(ref));
      if (latest.status === 'waiting') {
        await retry(() => delivery.release(claim));
        return poll();
      }
      await retry(() => delivery.acknowledge(claim));
      await retry(() => delivery.cancel(subscriptionId));
      return { kind: 'stopped' };
    }

    await retry(() => delivery.acknowledge(claim));
    await retry(() => delivery.cancel(subscriptionId));
    return { kind: 'resumed', occurrence: checkpoint.eventOccurrence };
  };

  return poll();
};
