import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyTaskRunSourcePatch,
  createTaskStorageAdapter,
  effect,
} from '@ontahi/core/runtime/server/tasks';
import { Effect } from 'effect';

const path = resolve('task-run.json');

const save = source => {
  writeFileSync(`${path}.new`, JSON.stringify(source));
  renameSync(`${path}.new`, path);
  return source;
};
const load = () => JSON.parse(readFileSync(path, 'utf8'));
const unsupported = async () => {
  throw new Error('This fixture only implements single-run persistence.');
};

export const storage = createTaskStorageAdapter({
  create: async input =>
    save({
      ...input,
      trigger: input.trigger ?? { cause: 'system' },
      status: 'queued',
      updatedAt: new Date().toISOString(),
    }),
  load: async ref => {
    const source = load();
    if (source.taskId !== ref.taskId || source.runId !== ref.runId)
      throw new Error('Run identity mismatch.');
    return source;
  },
  update: async (_ref, patch) =>
    save(applyTaskRunSourcePatch(load(), patch, new Date().toISOString())),
  claim: unsupported,
  cancelEvent: unsupported,
  listRecent: unsupported,
  listRecentForActor: unsupported,
  listBySubject: unsupported,
});

const remoteCustomer = effect.reconcilable({
  lookup: (_input, reference) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${process.env.FIXTURE_PROVIDER_URL}/${reference}`);
        if (response.status === 404) return { kind: 'confirmed-absent' };
        if (!response.ok) return { kind: 'unknown' };
        return { kind: 'found', result: await response.json() };
      },
      catch: () => ({ reason: 'provider_lookup_failed', message: 'Fixture lookup failed.' }),
    }),
  execute: (input, reference) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${process.env.FIXTURE_PROVIDER_URL}/${reference}`, {
          method: 'POST',
          body: JSON.stringify(input),
        });
        if (!response.ok) throw new Error('Fixture write failed.');
        return response.json();
      },
      catch: () => ({ reason: 'provider_write_failed', message: 'Fixture write failed.' }),
    }),
});

export const task = {
  id: 'Fixture.recover',
  execution: {
    initial: () => {
      throw new Error('Execution must restore the persisted Ontahí checkpoint.');
    },
    steps: {
      resume: {
        run: ({ state }) => {
          const { effect: prepared, ...checkpoint } = state;
          const finish = customer => ({
            kind: 'complete',
            result: {
              ...checkpoint,
              resumedByPid: process.pid,
              ...(customer ? { customer } : {}),
            },
          });
          return prepared
            ? remoteCustomer.run(prepared).pipe(Effect.map(finish))
            : Effect.succeed(finish());
        },
      },
    },
  },
  run: () => Effect.dieMessage('Explicit execution required.'),
};

export const writeCheckpoint = async ref => {
  const source = await Effect.runPromise(storage.loadSource(ref));
  if (source.checkpoint) throw new Error('The completed Workflow step ran twice.');
  await Effect.runPromise(
    storage.update(ref, {
      status: 'waiting',
      checkpoint: {
        version: 1,
        state: {
          step: 'resume',
          token: 'saved-value',
          writtenByPid: process.pid,
          ...(process.env.FIXTURE_PROVIDER_URL
            ? { effect: remoteCustomer.prepare(ref, 'create-customer', { name: 'Ada' }) }
            : {}),
        },
      },
    }),
  );
};

export const restoreCheckpoint = async ref => {
  const { createVercelWorkflowTaskExecutor } = await import(process.env.ONTAHI_EXECUTOR_URL);
  const executor = createVercelWorkflowTaskExecutor({
    taskRunStore: storage,
    getTaskDefinition: id => (id === task.id ? task : undefined),
  });
  return executor.runTask(ref, () => Promise.reject(new Error('Unexpected generated step')));
};
