import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { defineTask, defineTaskExecution } from './definitions.js';
import { createInProcessTaskRuntime } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';
import { effect } from './reconcilable-effect.js';
import {
  taskReconciliationCases,
  verifyTaskReconciliationConformance,
} from './reconciliation-conformance.js';

it.each(taskReconciliationCases)('reconciles a remote Customer when $scenario', async row => {
  const storage = createInMemoryTaskStorage();
  await verifyTaskReconciliationConformance(row, {
    createStorage: () => storage,
    createRuntime: store => createInProcessTaskRuntime({ storage: store }),
  });
  const queuedStorage = createInMemoryTaskStorage();
  const createRuntime = (store: typeof storage) =>
    createInProcessTaskRuntime({ storage: store, deferExplicitExecution: true });
  let worker = createRuntime(queuedStorage);
  await verifyTaskReconciliationConformance(row, {
    createStorage: () => queuedStorage,
    createRuntime,
    runWorker: async (task, signal) => {
      worker.register?.(task);
      const [run] = await Effect.runPromise(queuedStorage.listRecent());
      try {
        if (run && (await Effect.runPromise(worker.runCheckpoint(run), { signal }))) return run;
      } catch (error) {
        if (!signal?.aborted) throw error;
        worker = createRuntime(queuedStorage);
      }
      return undefined;
    },
  });
});

it('derives stable, distinct references from run and occurrence without a declaration ID', () => {
  const declare = () =>
    effect.reconcilable({
      lookup: () => Effect.succeed({ kind: 'confirmed-absent' }),
      execute: (_input: string, reference) => Effect.succeed(reference),
    });
  const run = { taskId: 'Customer.create', runId: 'run-1' };
  const prepared = declare().prepare(run, 'customer', 'Ada');
  expect(prepared).not.toHaveProperty('effectId');
  expect(declare().prepare(run, 'customer', 'Ada')).toEqual(prepared);
  expect(declare().prepare(run, 'contact', 'Ada').externalReference).not.toBe(
    prepared.externalReference,
  );
});

it('rejects a damaged reconciliation checkpoint before consulting the provider', async () => {
  const lookup = vi.fn(() => Effect.succeed({ kind: 'confirmed-absent' } as const));
  const execute = vi.fn((input: string) => Effect.succeed(input));
  const atom = effect.reconcilable({ id: 'remote', lookup, execute });
  const prepared = atom.prepare({ taskId: 'Customer.create', runId: 'run-1' }, 'customer', 'Ada');
  for (const corrupt of [
    { ...prepared, effectId: 'wrong' },
    { ...prepared, input: 'Tampered' },
  ]) {
    await expect(Effect.runPromise(Effect.flip(atom.run(corrupt)))).resolves.toMatchObject({
      reason: 'task_effect_checkpoint_invalid',
    });
  }
  expect(lookup).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

it('checks the persisted state again before recovering a stale running checkpoint', async () => {
  const storage = createInMemoryTaskStorage();
  const step = vi.fn(() => Effect.succeed({ kind: 'complete' as const, result: 'written' }));
  const task = defineTask<undefined, string>({
    id: 'Customer.stale-checkpoint',
    execution: defineTaskExecution({
      initial: () => ({ step: 'write' }),
      steps: { write: { run: step } },
    }),
    run: () => Effect.dieMessage('Explicit execution required'),
  });
  const ref = { taskId: task.id, runId: 'run' };
  const stale = await Effect.runPromise(storage.create(ref));
  const loadSource = vi.fn(storage.loadSource).mockReturnValueOnce(
    Effect.succeed({
      ...stale,
      status: 'running',
      checkpoint: { version: 1, state: { step: 'write' } },
    }),
  );
  await Effect.runPromise(storage.update(ref, { status: 'failed' }));
  const runtime = createInProcessTaskRuntime({ storage: { ...storage, loadSource } });
  runtime.register?.(task);
  const snapshot = await Effect.runPromise(runtime.getSnapshot(ref));
  expect(snapshot.status).toBe('failed');
  await vi.waitFor(() => expect(loadSource).toHaveBeenCalledTimes(2));
  expect(step).not.toHaveBeenCalled();
});
