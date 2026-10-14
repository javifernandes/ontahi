import { Effect } from 'effect';

import type { TaskExecutionCheckpoint, TaskStorage, TaskTrigger } from './types.js';

export type TaskStorageConformanceHarness = {
  readonly createStorage: () => TaskStorage;
  readonly identityPrefix?: string;
};

const invariant: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(`Task Storage conformance failed: ${message}`);
};

const run = <TValue, TError>(effect: Effect.Effect<TValue, TError>) => Effect.runPromise(effect);

/** Runs the provider-neutral persistence and atomic-claim contract for Task Storage adapters. */
export const verifyTaskStorageConformance = async (harness: TaskStorageConformanceHarness) => {
  const prefix = harness.identityPrefix ?? `task-storage-${Date.now()}`;
  const storage = harness.createStorage();
  const trigger = {
    cause: 'user_request',
    actor: { kind: 'user', id: `${prefix}-actor` },
  } satisfies TaskTrigger;
  const identity = { taskId: `${prefix}.task`, runId: `${prefix}.run` };

  const created = await run(
    storage.create({
      ...identity,
      input: { value: 'secret' },
      trigger,
      subject: { type: 'fixture', id: `${prefix}-subject` },
    }),
  );
  invariant(created.status === 'queued', 'create must persist a queued source');

  const interactionCheckpoint = {
    version: 1,
    state: { step: 'approval' },
    interaction: {
      id: `${prefix}-interaction`,
      kind: 'approval',
      prompt: 'Continue?',
      proposal: { id: `${prefix}-proposal`, summary: 'Continue.', requests: [{}] },
      createdAt: '2026-10-14T00:00:00.000Z',
    },
  } satisfies TaskExecutionCheckpoint;
  await run(
    storage.update(identity, {
      status: 'waiting',
      progress: { phase: 'waiting', message: 'Waiting' },
      checkpoint: interactionCheckpoint,
    }),
  );
  const claimedCheckpoint = {
    version: 1,
    state: { step: 'approved' },
    response: {
      interactionId: `${prefix}-interaction`,
      decision: 'approve',
    },
  } satisfies TaskExecutionCheckpoint;
  const interactionClaims = await Promise.all([
    run(storage.claimInteraction(identity, `${prefix}-interaction`, claimedCheckpoint)),
    run(storage.claimInteraction(identity, `${prefix}-interaction`, claimedCheckpoint)),
  ]);
  invariant(
    interactionClaims.filter(value => value !== undefined).length === 1,
    'one pending Interaction must have one claim winner',
  );

  await run(storage.attachRuntimeRef(identity, { name: 'fixture', runId: `${prefix}-provider` }));
  const recreated = harness.createStorage();
  const loaded = await run(recreated.loadSource(identity));
  invariant(loaded.input !== undefined, 'runtime recreation must retain private input');
  invariant(loaded.runtime?.runId === `${prefix}-provider`, 'runtime references must be retained');
  const snapshot = await run(recreated.getSnapshot(identity));
  invariant(!('input' in snapshot), 'public snapshots must not disclose private input');

  const actorRuns = await run(
    recreated.listRecentForActor({ kind: 'user', id: `${prefix}-actor` }, 20),
  );
  invariant(
    actorRuns.some(runItem => runItem.runId === identity.runId),
    'actor listing must match',
  );
  invariant(!('result' in actorRuns[0]!), 'run listings must omit result payloads');

  const duplicate = await run(Effect.flip(recreated.create(identity)));
  invariant(
    duplicate.reason === 'task_run_already_exists',
    `duplicates must use canonical failure, received ${duplicate.reason}`,
  );

  const eventIdentity = { taskId: `${prefix}.task`, runId: `${prefix}.event-run` };
  await run(recreated.create(eventIdentity));
  const eventWait = {
    id: `${prefix}-wait`,
    kind: 'event' as const,
    eventId: `${prefix}.Event`,
    eventVersion: 1,
    correlation: { requestId: prefix },
    createdAt: '2026-10-14T00:00:00.000Z',
  };
  await run(
    recreated.update(eventIdentity, {
      status: 'waiting',
      checkpoint: { version: 1, state: { step: 'wait' }, eventWait },
    }),
  );
  const eventCheckpoint = {
    version: 1,
    state: { step: 'complete' },
    eventResume: {
      kind: 'event',
      waitId: eventWait.id,
      eventId: eventWait.eventId,
      eventVersion: 1,
      occurrenceId: `${prefix}-occurrence`,
      occurredAt: '2026-10-14T00:01:00.000Z',
      deliveryId: `${prefix}-delivery`,
      subscriptionId: `${prefix}-subscription`,
      attempt: 1,
      claimId: `${prefix}-claim`,
      consumerId: `${prefix}-consumer`,
      leaseExpiresAt: '2026-10-14T00:02:00.000Z',
    },
  } satisfies TaskExecutionCheckpoint;
  const eventClaims = await Promise.all([
    run(recreated.claimEvent(eventIdentity, eventWait.id, eventCheckpoint)),
    run(recreated.claimEvent(eventIdentity, eventWait.id, eventCheckpoint)),
  ]);
  invariant(
    eventClaims.filter(value => value !== undefined).length === 1,
    'one pending Event wait must have one claim winner',
  );
};
