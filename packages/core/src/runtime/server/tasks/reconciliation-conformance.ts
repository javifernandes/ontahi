import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

import { Effect } from 'effect';

import { defineTask, defineTaskExecution } from './definitions.js';
import { effect, type TaskEffectLookup } from './reconcilable-effect.js';
import type { TaskDefinition, TaskRuntime, TaskStorage } from './types.js';

type Customer = { id: string; name: string; externalReference: string };
type Input = { name: string };

export const taskReconciliationCases = [
  { scenario: 'committed', attempts: 1, customers: 1, state: 'completed' },
  { scenario: 'worker-recreated', attempts: 1, customers: 1, state: 'completed' },
  { scenario: 'confirmed-absent', attempts: 2, customers: 1, state: 'completed' },
  { scenario: 'inconclusive', attempts: 1, customers: 1, state: 'failed' },
  { scenario: 'lookup-unavailable', attempts: 1, customers: 1, state: 'failed' },
  { scenario: 'retry-times-out', attempts: 2, customers: 0, state: 'failed' },
  { scenario: 'retry-commits', attempts: 2, customers: 1, state: 'completed' },
] as const;

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 5_000;
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for reconciliation conformance condition');
    await setTimeout(10);
  }
};

export const verifyTaskReconciliationConformance = async (
  row: (typeof taskReconciliationCases)[number],
  harness: {
    createStorage: () => TaskStorage;
    createRuntime: (storage: TaskStorage) => TaskRuntime;
    runWorker?: (task: TaskDefinition<Input, Customer>, signal?: AbortSignal) => Promise<unknown>;
  },
) => {
  const stored: Customer[] = [];
  const writes: { input: Input; reference: string }[] = [];
  const reads: string[] = [];
  const createCustomer = effect.reconcilable({
    lookup: (_input: Input, reference: string) =>
      Effect.suspend(
        (): Effect.Effect<TaskEffectLookup<Customer>, { reason: string; message: string }> => {
          reads.push(reference);
          if (writes.length && row.scenario === 'lookup-unavailable') {
            return Effect.fail({ reason: 'remote_unavailable', message: 'Lookup timed out' });
          }
          if (writes.length && row.scenario === 'inconclusive') {
            return Effect.succeed({ kind: 'unknown' });
          }
          const customer = stored.find(record => record.externalReference === reference);
          return Effect.succeed(
            customer ? { kind: 'found', result: customer } : { kind: 'confirmed-absent' },
          );
        },
      ),
    execute: (input, reference) =>
      Effect.suspend(() => {
        writes.push({ input, reference });
        const customer = { id: 'remote-1', ...input, externalReference: reference };
        const firstWrite = writes.length === 1;
        const firstWriteDidNotCommit =
          row.scenario === 'confirmed-absent' || row.scenario === 'retry-commits';
        if (row.scenario !== 'retry-times-out' && !(firstWrite && firstWriteDidNotCommit)) {
          stored.push(customer);
        }
        if (row.scenario === 'worker-recreated') return Effect.never;
        return firstWrite || row.scenario === 'retry-times-out' || row.scenario === 'retry-commits'
          ? Effect.fail({ reason: 'remote_timeout', message: 'Create response lost' })
          : Effect.succeed(customer);
      }),
  });
  type State = { step: string; effect?: ReturnType<typeof createCustomer.prepare> };
  const task = defineTask<Input, Customer>({
    id: 'Customer.create',
    execution: defineTaskExecution<Input, State, Customer>({
      initial: () => ({ step: 'prepare' }),
      steps: {
        prepare: {
          run: ({ input, context }) =>
            Effect.succeed({
              kind: 'continue',
              state: { step: 'write', effect: createCustomer.prepare(context, 'customer', input) },
            }),
        },
        write: {
          run: ({ state }) =>
            state.effect
              ? createCustomer
                  .run(state.effect)
                  .pipe(Effect.map(result => ({ kind: 'complete' as const, result })))
              : Effect.dieMessage('Prepared effect missing'),
        },
      },
    }),
    run: () => Effect.dieMessage('Explicit execution required'),
  });
  const storage = harness.createStorage();
  let runtime = harness.createRuntime(storage);
  const admission = { key: 'delivery-1', policy: 'skip-if-completed' } as const;
  const run = await Effect.runPromise(runtime.start(task, { name: 'Ada' }, { admission }));
  const runWorker = harness.runWorker;
  if (runWorker) {
    const queued = await Effect.runPromise(storage.loadSource(run));
    assert.equal(queued.status, 'queued');
    assert.ok(queued.checkpoint);
    assert.equal(writes.length, 0);
    if (row.scenario === 'worker-recreated') {
      const controller = new AbortController();
      const interrupted = runWorker(task, controller.signal);
      try {
        await Promise.race([
          waitFor(() => stored.length === 1),
          interrupted.then(() => assert.fail('Worker ended before its simulated interruption')),
        ]);
        assert.equal(await runWorker(task), undefined, 'A competing worker must skip the claim');
      } finally {
        controller.abort();
        await interrupted;
      }
    }
    await runWorker(task);
  } else if (row.scenario === 'worker-recreated') {
    await waitFor(() => stored.length === 1);
    runtime = harness.createRuntime(harness.createStorage());
    runtime.register?.(task);
  }

  await waitFor(async () => {
    const snapshot = await Effect.runPromise(runtime.getSnapshot(run));
    return snapshot.status === 'completed' || snapshot.status === 'failed';
  });
  const source = await Effect.runPromise(storage.loadSource(run));
  assert.equal(source.status, row.state);
  const reference = writes[0]!.reference;
  const lookupCount =
    row.scenario === 'retry-times-out' || row.scenario === 'retry-commits' ? 3 : 2;
  assert.deepEqual(
    reads,
    Array.from({ length: lookupCount }, () => reference),
  );
  assert.deepEqual(
    writes,
    Array.from({ length: row.attempts }, () => ({
      input: { name: 'Ada' },
      reference,
    })),
  );
  assert.equal(stored.length, row.customers);
  if (row.state === 'completed') {
    assert.deepEqual(source.result, { id: 'remote-1', name: 'Ada', externalReference: reference });
  } else {
    assert.equal(source.error?.code, 'task_effect_outcome_ambiguous');
    const state = source.checkpoint?.state as State | undefined;
    assert.equal(state?.effect?.externalReference, reference);
    const duplicate = await Effect.runPromise(runtime.start(task, { name: 'Ada' }, { admission }));
    assert.equal(duplicate.runId, run.runId);
    assert.equal(duplicate.admission, 'reconciliation-required');
    assert.equal(writes.length, row.attempts);
  }
};
