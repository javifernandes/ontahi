import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { applyTaskRunSourcePatch, createTaskStorageAdapter } from './storage-adapter.js';
import type { TaskRunSource } from './types.js';

const source = (): TaskRunSource => ({
  taskId: 'TodoList.export',
  runId: 'run-1',
  status: 'waiting',
  input: { private: true },
  trigger: { cause: 'user_request', actor: { kind: 'user', id: 'user-1' } },
  progress: { phase: 'waiting', percent: 10 },
  checkpoint: {
    version: 1,
    state: { step: 'approval' },
    interaction: {
      id: 'approval',
      kind: 'approval',
      prompt: 'Continue?',
      proposal: { id: 'proposal', summary: 'Continue.', requests: [{}] },
      createdAt: '2026-10-15T00:00:00.000Z',
    },
  },
  updatedAt: '2026-10-15T00:00:00.000Z',
});

describe('Task Storage adapter facade', () => {
  it('projects promise operations through the complete Effect contract', async () => {
    const persisted = source();
    const operations = {
      create: vi.fn(async () => persisted),
      update: vi.fn(async () => persisted),
      claim: vi.fn(async () => persisted),
      cancelEvent: vi.fn(async () => persisted),
      load: vi.fn(async () => persisted),
      listRecent: vi.fn(async () => [persisted]),
      listRecentForActor: vi.fn(async () => [persisted]),
    };
    const storage = createTaskStorageAdapter(operations);
    const ref = { taskId: persisted.taskId, runId: persisted.runId };

    await expect(Effect.runPromise(storage.create(ref))).resolves.toBe(persisted);
    await expect(
      Effect.runPromise(storage.update(ref, { status: 'running' })),
    ).resolves.toMatchObject({ taskId: ref.taskId, status: 'waiting' });
    await Effect.runPromise(storage.claimInteraction(ref, 'approval', persisted.checkpoint!));
    await Effect.runPromise(storage.claimEvent(ref, 'event-wait', persisted.checkpoint!));
    await Effect.runPromise(storage.cancelEvent(ref, 'event-wait', 'cancelled'));
    await Effect.runPromise(storage.attachRuntimeRef(ref, { name: 'test', runId: 'provider-run' }));
    await Effect.runPromise(storage.get(ref));
    await Effect.runPromise(storage.getSnapshot(ref));
    await expect(Effect.runPromise(storage.loadSource(ref))).resolves.toBe(persisted);
    await expect(Effect.runPromise(storage.listRecent())).resolves.toMatchObject([
      { taskId: ref.taskId, trigger: persisted.trigger },
    ]);
    await Effect.runPromise(storage.listRecentForActor(persisted.trigger.actor!));

    expect(operations.claim).toHaveBeenNthCalledWith(
      1,
      ref,
      'interaction',
      'approval',
      persisted.checkpoint,
    );
    expect(operations.claim).toHaveBeenNthCalledWith(
      2,
      ref,
      'eventWait',
      'event-wait',
      persisted.checkpoint,
    );
  });

  it('normalizes unknown failures and preserves canonical failures', async () => {
    const failure = new Error('database unavailable');
    const canonical = { reason: 'task_run_not_found', message: 'Missing.' };
    const storage = createTaskStorageAdapter({
      create: async () => {
        throw failure;
      },
      update: async () => source(),
      claim: async () => undefined,
      cancelEvent: async () => undefined,
      load: async () => {
        throw canonical;
      },
      listRecent: async () => [],
      listRecentForActor: async () => [],
    });

    await expect(
      Effect.runPromise(Effect.flip(storage.create({ taskId: 'task', runId: 'run' }))),
    ).resolves.toMatchObject({
      reason: 'task_run_store_failed',
      cause: 'database unavailable',
    });
    await expect(
      Effect.runPromise(Effect.flip(storage.get({ taskId: 'task', runId: 'run' }))),
    ).resolves.toBe(canonical);
  });

  it('materializes patch semantics before provider serialization', () => {
    expect(
      applyTaskRunSourcePatch(
        source(),
        {
          progress: { percent: 50 },
          checkpoint: undefined,
          result: { url: 'https://example.test/export.json' },
        },
        '2026-10-15T00:01:00.000Z',
      ),
    ).toMatchObject({
      input: { private: true },
      progress: { phase: 'waiting', percent: 50 },
      checkpoint: undefined,
      result: { url: 'https://example.test/export.json' },
      updatedAt: '2026-10-15T00:01:00.000Z',
    });
  });
});
