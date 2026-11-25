import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { createInProcessTaskRuntime } from './in-process-adapter.js';
import { createInMemoryTaskStorage } from './memory-store.js';
import { effect } from './reconcilable-effect.js';
import {
  taskReconciliationCases,
  verifyTaskReconciliationConformance,
} from './reconciliation-conformance.js';

it.each(taskReconciliationCases)('reconciles a remote Customer when $scenario', row => {
  const storage = createInMemoryTaskStorage();
  return verifyTaskReconciliationConformance(row, {
    createStorage: () => storage,
    createRuntime: store => createInProcessTaskRuntime({ storage: store }),
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
