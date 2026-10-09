import { Effect, Exit, Fiber, Runtime } from 'effect';

import { toGraphCommandRequest } from '../../data-graph/command-protocol.js';
import type { CommittedMutation, CommittedMutationSet } from '../../data-graph/mutation-impact.js';
import type { AppliedMutationOutcome } from '../../data-graph/mutation-reaction.js';
import { normalizeEntityRef, type AnyEntityRef } from '../../data-graph/ref/index.js';
import { cloneJson } from '../../value/json.js';

import {
  createContextResourceApi,
  type ServerContextResourceApi,
  type ServerRuntimeResourceMap,
} from './context-resources.js';
import type { OperationRuntimeContext } from './context-types.js';
import {
  getOperationRuntimeContext,
  getRequiredOperationRuntimeContext,
  operationRuntimeContextStorage,
} from './context.js';

export type UnitOfWork = {
  readonly resources: ServerContextResourceApi;
  readonly refs: UnitOfWorkRefResolutionApi;
  readonly mutations: UnitOfWorkMutationJournalApi;
};

export type UnitOfWorkMutationJournalApi = {
  snapshot: () => CommittedMutationSet;
};

export type UnitOfWorkRefResolutionOptions<TValue> = {
  readonly key?: string | symbol;
  readonly load: () => TValue;
};

export type UnitOfWorkRefResolutionApi = {
  resolve: <TValue>(ref: AnyEntityRef, options: UnitOfWorkRefResolutionOptions<TValue>) => TValue;
  invalidate: (ref: AnyEntityRef) => void;
};

export type ChildUnitOfWorkOptions = {
  isolatedResources?: Iterable<string>;
  resources?: Iterable<readonly [string, unknown]>;
};

const unitOfWorkByResources = new WeakMap<ServerRuntimeResourceMap, UnitOfWork>();
const mutationJournalByUnitOfWork = new WeakMap<UnitOfWork, UnitOfWorkMutationJournal>();
const DEFAULT_REF_RESOLUTION_KEY = Symbol('ontahi.unitOfWork.refs.default');

type UnitOfWorkMutationJournal = {
  mutations: CommittedMutation[];
  sealed: boolean;
};

const mutationSetFrom = (mutations: readonly CommittedMutation[]): CommittedMutationSet =>
  cloneJson({
    mutations,
    precision: mutations.length === 0 ? 'exact' : 'intensional',
  });

const mutationJournalFor = (unitOfWork: UnitOfWork): UnitOfWorkMutationJournal => {
  const journal = mutationJournalByUnitOfWork.get(unitOfWork);
  if (!journal) throw new Error('UnitOfWork mutation journal is unavailable');
  return journal;
};

const createUnitOfWorkRefResolutionApi = (): UnitOfWorkRefResolutionApi => {
  const resolutionsByRef = new Map<string, Map<string | symbol, unknown>>();

  return {
    resolve: <TValue>(
      ref: AnyEntityRef,
      options: UnitOfWorkRefResolutionOptions<TValue>,
    ): TValue => {
      const refKey = normalizeEntityRef(ref);
      let resolutions = resolutionsByRef.get(refKey);
      if (!resolutions) {
        resolutions = new Map();
        resolutionsByRef.set(refKey, resolutions);
      }
      const resolutionKey = options.key ?? DEFAULT_REF_RESOLUTION_KEY;
      if (resolutions.has(resolutionKey)) return resolutions.get(resolutionKey) as TValue;

      const loaded = options.load();
      resolutions.set(resolutionKey, loaded);
      return loaded;
    },
    invalidate: ref => {
      resolutionsByRef.delete(normalizeEntityRef(ref));
    },
  };
};

const resolveUnitOfWork = (resources: ServerRuntimeResourceMap): UnitOfWork => {
  const existing = unitOfWorkByResources.get(resources);
  if (existing) return existing;

  const journal: UnitOfWorkMutationJournal = { mutations: [], sealed: false };
  const created: UnitOfWork = {
    resources: createContextResourceApi(resources),
    refs: createUnitOfWorkRefResolutionApi(),
    mutations: {
      snapshot: () => mutationSetFrom(journal.mutations),
    },
  };
  unitOfWorkByResources.set(resources, created);
  mutationJournalByUnitOfWork.set(created, journal);
  return created;
};

export const getCurrentUnitOfWork = (): UnitOfWork | undefined => {
  const context = getOperationRuntimeContext();
  return context ? resolveUnitOfWork(context.resources) : undefined;
};

export const getRequiredUnitOfWork = (): UnitOfWork => {
  const current = getCurrentUnitOfWork();
  if (!current) throw new Error('UnitOfWork is not available outside a server operation context');
  return current;
};

export const recordAppliedGraphCommand = (command: AppliedMutationOutcome['command']): boolean => {
  const unitOfWork = getCurrentUnitOfWork();
  if (!unitOfWork) return false;
  const journal = mutationJournalFor(unitOfWork);
  if (journal.sealed) throw new Error('UnitOfWork mutation journal is already sealed');
  journal.mutations.push({
    command: toGraphCommandRequest(command),
    provenance: 'captured',
  });
  return true;
};

export const recordAppliedMutationOutcome = (outcome: AppliedMutationOutcome): boolean =>
  recordAppliedGraphCommand(outcome.command);

export const sealCurrentUnitOfWorkMutationJournal = (): CommittedMutationSet => {
  const unitOfWork = getRequiredUnitOfWork();
  const journal = mutationJournalFor(unitOfWork);
  journal.sealed = true;
  return mutationSetFrom(journal.mutations);
};

export const commitMutationSetToCurrentUnitOfWork = (set: CommittedMutationSet): void => {
  if (set.mutations.length === 0) return;
  const journal = mutationJournalFor(getRequiredUnitOfWork());
  if (journal.sealed) throw new Error('UnitOfWork mutation journal is already sealed');
  journal.mutations.push(...cloneJson(set.mutations));
};

const resumeOutsideChildContext = <TValue>(
  parent: OperationRuntimeContext | undefined,
  resume: () => TValue,
): TValue =>
  parent
    ? operationRuntimeContextStorage.run(parent, resume)
    : operationRuntimeContextStorage.exit(resume);

const runInOperationContext = <TValue, TError, TRequirements>(
  context: OperationRuntimeContext,
  effect: Effect.Effect<TValue, TError, TRequirements>,
): Effect.Effect<TValue, TError, TRequirements> =>
  Effect.runtime<TRequirements>().pipe(
    Effect.flatMap(runtime =>
      Effect.async<TValue, TError>((resume, signal) => {
        const parent = getOperationRuntimeContext();
        const fiber = operationRuntimeContextStorage.run(context, () =>
          Runtime.runFork(runtime)(effect, { immediate: true }),
        );

        fiber.addObserver(exit =>
          resumeOutsideChildContext(parent, () =>
            resume(
              Exit.match(exit, {
                onFailure: Effect.failCause,
                onSuccess: Effect.succeed,
              }),
            ),
          ),
        );

        if (signal.aborted) {
          Runtime.runFork(runtime)(Fiber.interrupt(fiber), { immediate: true });
        }

        return Effect.sync(() => {
          Runtime.runFork(runtime)(Fiber.interrupt(fiber), { immediate: true });
        });
      }),
    ),
  );

export const withChildUnitOfWork = <TValue, TError, TRequirements>(
  effect: Effect.Effect<TValue, TError, TRequirements>,
  options: ChildUnitOfWorkOptions = {},
): Effect.Effect<TValue, TError, TRequirements> =>
  Effect.suspend(() => {
    const parent = getRequiredOperationRuntimeContext();
    const resources = new Map(parent.resources);
    for (const key of options.isolatedResources ?? []) resources.delete(key);
    for (const [key, value] of options.resources ?? []) resources.set(key, value);

    return runInOperationContext({ ...parent, resources }, effect);
  });
