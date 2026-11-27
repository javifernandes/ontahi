import assert from 'node:assert/strict';

import { Chunk, Deferred, Effect, Stream } from 'effect';

import { graphSchema } from '../../../data-graph/index.js';
import { defineEvent } from '../events/declaration.js';
import type { AnyEventDeclaration } from '../events/types.js';

import { defineTask, defineTaskExecution } from './definitions.js';
import type { TaskDefinition, TaskRunIdentity, TaskRuntime } from './types.js';

export const durableOperationConformanceCases = [
  'atomic-admission',
  'approval-resumption',
  'retained-event-resumption',
  'ordered-observation',
  'expired-claim-fencing',
  'running-cancellation',
] as const;

export type DurableOperationConformanceCase = (typeof durableOperationConformanceCases)[number];

type ConformanceHost = {
  runtime: TaskRuntime;
  /** Advance the named fixture until its next persisted wait or terminal state. */
  drive(): Promise<void>;
};

export type DurableOperationConformanceHarness = {
  /** Create an independent host against the same persistent application state. */
  open(task: TaskDefinition<any, any>, events?: readonly AnyEventDeclaration[]): ConformanceHost;
  /** Publish one fixture callback and return its accepted occurrence identity. */
  publish?: (declaration: AnyEventDeclaration, requestId: string) => Promise<string>;
  expireClaim?: (ref: TaskRunIdentity) => Promise<void>;
  cancel?: (ref: TaskRunIdentity) => Promise<boolean>;
};

const run = Effect.runPromise;
const actor = { kind: 'system' } as const;

const approvalTask = (id = 'Conformance.approval', beforeWait: Effect.Effect<void> = Effect.void) =>
  defineTask<undefined, string>({
    id,
    execution: defineTaskExecution<undefined, { step: string }, string>({
      initial: () => ({ step: 'approve' }),
      steps: {
        approve: {
          run: ({ state, response }) =>
            response && 'decision' in response
              ? Effect.succeed({ kind: 'complete', result: response.decision })
              : Effect.as(beforeWait, {
                  kind: 'interaction' as const,
                  state,
                  interaction: {
                    id: 'conformance-approval',
                    prompt: 'Approve?',
                    proposal: { id: 'proposal', summary: 'Continue the fixture', requests: [{}] },
                  },
                }),
        },
      },
    }),
    run: () => Effect.dieMessage('Explicit Task execution is required'),
  });

const approve = async (host: ConformanceHost, ref: TaskRunIdentity) => {
  assert.ok(host.runtime.respondToInteraction, 'The runtime must accept Interaction responses');
  await run(
    host.runtime.respondToInteraction(
      ref,
      { interactionId: 'conformance-approval', decision: 'approve' },
      { actor },
    ),
  );
};

const verifyApproval = async (harness: DurableOperationConformanceHarness, observe: boolean) => {
  const startWaiting = await run(Deferred.make<void>());
  const task = approvalTask(undefined, Deferred.await(startWaiting));
  const first = harness.open(task);
  const ref = await run(
    first.runtime.start(task, undefined, { trigger: { cause: 'system', actor } }),
  );
  const observed = await run(Deferred.make<void>());
  const controller = new AbortController();
  if (observe) assert.ok(first.runtime.observe, 'The runtime must expose Task observation');
  const snapshots = observe
    ? run(
        first.runtime.observe!(ref).pipe(
          Stream.tap(() => Deferred.succeed(observed, undefined)),
          Stream.takeUntil(snapshot => snapshot.status === 'completed'),
          Stream.runCollect,
          Effect.timeout('10 seconds'),
        ),
        { signal: controller.signal },
      )
    : undefined;

  try {
    if (snapshots) await run(Deferred.await(observed).pipe(Effect.timeout('10 seconds')));
    await run(Deferred.succeed(startWaiting, undefined));
    await first.drive();
    const waiting = await run(first.runtime.getSnapshot(ref));
    assert.equal(waiting.status, 'waiting');
    assert.equal(waiting.interaction?.id, 'conformance-approval');
    const resumed = harness.open(task);
    await approve(resumed, ref);
    await resumed.drive();
    const completed = await run(first.runtime.getSnapshot(ref));
    assert.equal(completed.runId, ref.runId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.result, 'approve');
    if (snapshots) {
      const states = Chunk.toReadonlyArray(await snapshots).map(snapshot => snapshot.status);
      const lifecycle = states.filter((value, index) => value !== states[index - 1]);
      assert.ok(lifecycle[0] === 'queued' || lifecycle[0] === 'running');
      assert.deepEqual(lifecycle.slice(-3), ['waiting', 'running', 'completed']);
    }
  } finally {
    controller.abort();
    await run(Deferred.succeed(startWaiting, undefined));
    await snapshots?.catch(() => {});
  }
};

const verifyAdmission = async (harness: DurableOperationConformanceHarness) => {
  for (const policy of ['reuse-running', 'skip-if-completed'] as const) {
    const task = approvalTask(`Conformance.admission.${policy}`);
    const left = harness.open(task);
    const right = harness.open(task);
    const options = {
      admission: { key: policy, policy },
      trigger: { cause: 'system', actor },
    } as const;
    const [first, second] = await Promise.all([
      run(left.runtime.start(task, undefined, options)),
      run(right.runtime.start(task, undefined, options)),
    ]);
    assert.equal(first.runId, second.runId);
    assert.deepEqual(new Set([first.admission, second.admission]), new Set(['created', 'reused']));
    await left.drive();
    await approve(right, first);
    await right.drive();
    const repeated = await run(left.runtime.start(task, undefined, options));
    if (policy === 'skip-if-completed') {
      assert.equal(repeated.runId, first.runId);
      assert.equal(repeated.admission, 'already-completed');
    } else {
      assert.notEqual(repeated.runId, first.runId);
      assert.equal(repeated.admission, 'created');
    }
  }
};

const verifyRetainedEvent = async (harness: DurableOperationConformanceHarness) => {
  assert.ok(harness.publish, 'The harness must publish retained Events');
  const ready = defineEvent({
    id: 'DurableConformanceReady',
    version: 1,
    description: 'A retained callback for the durable conformance fixture.',
    payload: graphSchema.object({ requestId: graphSchema.string() }),
  });
  let continuations = 0;
  const task = defineTask<{ requestId: string }, string>({
    id: 'Conformance.event',
    execution: defineTaskExecution<{ requestId: string }, { step: string }, string>({
      initial: () => ({ step: 'wait' }),
      steps: {
        wait: {
          run: ({ input, state, event }) =>
            Effect.sync(() => {
              if (event) {
                continuations += 1;
                return { kind: 'complete', result: event.occurrenceId };
              }
              return {
                kind: 'event',
                state,
                event: { declaration: ready, correlation: { requestId: input.requestId } },
              };
            }),
        },
      },
    }),
    run: () => Effect.dieMessage('Explicit Task execution is required'),
  });
  const first = harness.open(task, [ready]);
  const ref = await run(first.runtime.start(task, { requestId: 'matching' }));
  await first.drive();
  assert.equal((await run(first.runtime.getSnapshot(ref))).waitingOn?.kind, 'event');
  const unrelated = await harness.publish(ready, 'other');
  const matching = await harness.publish(ready, 'matching');
  const duplicate = await harness.publish(ready, 'matching');
  const second = harness.open(task, [ready]);
  const competitor = harness.open(task, [ready]);
  await Promise.all([second.drive(), competitor.drive()]);
  await competitor.drive();
  const snapshot = await run(second.runtime.getSnapshot(ref));
  assert.equal(snapshot.status, 'completed');
  assert.equal(snapshot.runId, ref.runId);
  assert.notEqual(snapshot.result, unrelated);
  assert.ok(snapshot.result === matching || snapshot.result === duplicate);
  assert.equal(continuations, 1);
};

const verifyHeldClaim = async (harness: DurableOperationConformanceHarness, cancel: boolean) => {
  const change = cancel ? harness.cancel : harness.expireClaim;
  assert.ok(change, 'The harness must control cancellation or expiry');
  const entered = await run(Deferred.make<void>());
  const unblock = await run(Deferred.make<void>());
  let attempts = 0;
  const task = defineTask<undefined, string>({
    id: 'Conformance.held-claim',
    execution: defineTaskExecution<undefined, { step: string }, string>({
      initial: () => ({ step: 'run' }),
      steps: {
        run: {
          run: () =>
            Effect.gen(function* () {
              if (++attempts === 1) {
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(unblock);
                return { kind: 'complete', result: 'stale' };
              }
              return { kind: 'complete', result: 'recovered' };
            }),
        },
      },
    }),
    run: () => Effect.dieMessage('Explicit Task execution is required'),
  });
  const first = harness.open(task);
  const second = harness.open(task);
  const admission = { key: 'held-claim', policy: 'skip-if-completed' } as const;
  const ref = await run(first.runtime.start(task, undefined, { admission }));
  const held = first.drive();
  try {
    await Promise.race([
      run(Deferred.await(entered).pipe(Effect.timeout('10 seconds'))),
      held.then(() => assert.fail('The worker exited before the checkpoint was held')),
    ]);
    await second.drive();
    assert.equal(attempts, 1);
    const changed = await change(ref);
    if (cancel) assert.equal(changed, true);
    await second.drive();
  } finally {
    await run(Deferred.succeed(unblock, undefined));
    await held;
  }
  const snapshot = await run(second.runtime.getSnapshot(ref));
  if (cancel) {
    assert.equal(snapshot.status, 'cancelled');
    assert.equal(snapshot.error?.code, 'task_effect_outcome_ambiguous');
    const repeat = await run(second.runtime.start(task, undefined, { admission }));
    assert.equal(repeat.runId, ref.runId);
    assert.equal(repeat.admission, 'reconciliation-required');
    assert.equal(attempts, 1);
    assert.equal(await harness.cancel!(ref), false);
  } else {
    assert.equal(snapshot.status, 'completed');
    assert.equal(snapshot.result, 'recovered');
    assert.equal(attempts, 2);
  }
};

/** Execute an explicit guarantee against a host configuration. Register each case separately. */
export const verifyDurableOperationConformance = (
  name: DurableOperationConformanceCase,
  harness: DurableOperationConformanceHarness,
): Promise<void> => {
  switch (name) {
    case 'atomic-admission':
      return verifyAdmission(harness);
    case 'approval-resumption':
      return verifyApproval(harness, false);
    case 'retained-event-resumption':
      return verifyRetainedEvent(harness);
    case 'ordered-observation':
      return verifyApproval(harness, true);
    case 'expired-claim-fencing':
      return verifyHeldClaim(harness, false);
    case 'running-cancellation':
      return verifyHeldClaim(harness, true);
  }
};
