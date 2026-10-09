import { Effect, Exit, Fiber, Runtime } from 'effect';

import {
  toGraphCommandRequest,
  type GraphCommandRequest,
} from '../../data-graph/command-protocol.js';
import type {
  CommittedMutation,
  CommittedMutationProvenance,
  CommittedMutationSet,
} from '../../data-graph/mutation-impact.js';
import type { AppliedMutationOutcome } from '../../data-graph/mutation-reaction.js';
import { normalizeEntityRef, type AnyEntityRef } from '../../data-graph/ref/index.js';
import type { SelectionAst } from '../../data-graph/selection-ast.js';
import { cloneJson } from '../../value/json.js';

import { getServerRuntimeConfig } from './config.js';
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
  /** Report the canonical Graph Command equivalent of mutation work performed outside the runtime. */
  declare: (command: GraphCommandRequest['command']) => void;
  /** Conservatively report that an already-executed native mutation changed a Selection. */
  changed: (selection: SelectionAst) => void;
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
  precision: CommittedMutationSet['precision'];
  sealed: boolean;
  budget: MutationJournalBudget;
};

type MutationJournalBudget = {
  maxEntries: number;
  maxBytes: number;
};

const textEncoder = new TextEncoder();
const provenanceStrength: Record<CommittedMutationProvenance, number> = {
  conservative: 0,
  declared: 1,
  captured: 2,
};

const mutationSetFrom = (journal: UnitOfWorkMutationJournal): CommittedMutationSet =>
  cloneJson({
    mutations: journal.mutations,
    precision: journal.precision,
  });

const mutationBytes = (mutations: readonly CommittedMutation[]): number =>
  textEncoder.encode(JSON.stringify(mutations)).byteLength;

const fitsMutationBudget = (
  mutations: readonly CommittedMutation[],
  budget: MutationJournalBudget,
): boolean => mutations.length <= budget.maxEntries && mutationBytes(mutations) <= budget.maxBytes;

const graphChange = (): CommittedMutation => ({
  effect: { kind: 'graph-change' },
  provenance: 'conservative',
});

const affectedEntityNames = (mutation: CommittedMutation): readonly string[] | undefined => {
  if (mutation.effect.kind === 'graph-change') return undefined;
  if (mutation.effect.kind === 'selection-change') return [mutation.effect.selection.entityName];

  const command = mutation.effect.request.command;
  if (command.kind === 'entity-mutation-command') return [command.entityName];
  return [command.relation.sourceEntityName, command.relation.targetEntityName];
};

const widenMutations = (
  mutations: readonly CommittedMutation[],
  budget: MutationJournalBudget,
): CommittedMutation[] => {
  const names = new Set<string>();
  for (const mutation of mutations) {
    const affected = affectedEntityNames(mutation);
    if (!affected) return [graphChange()];
    affected.forEach(name => names.add(name));
  }
  const widened = [...names].sort().map(
    (entityName): CommittedMutation => ({
      effect: {
        kind: 'selection-change',
        selection: { kind: 'selection', entityName, expression: { kind: 'all' } },
      },
      provenance: 'conservative',
    }),
  );
  return widened.length > 0 && fitsMutationBudget(widened, budget) ? widened : [graphChange()];
};

const appendMutation = (journal: UnitOfWorkMutationJournal, mutation: CommittedMutation): void => {
  if (journal.sealed) throw new Error('UnitOfWork mutation journal is already sealed');
  if (journal.precision === 'widened' && journal.mutations[0]?.effect.kind === 'graph-change')
    return;

  if (journal.precision === 'widened') {
    journal.mutations = widenMutations([...journal.mutations, cloneJson(mutation)], journal.budget);
    return;
  }

  const effectKey = JSON.stringify(mutation.effect);
  const duplicateIndex = journal.mutations.findIndex(
    current => JSON.stringify(current.effect) === effectKey,
  );
  if (duplicateIndex >= 0) {
    const current = journal.mutations[duplicateIndex]!;
    if (provenanceStrength[mutation.provenance] > provenanceStrength[current.provenance]) {
      journal.mutations[duplicateIndex] = cloneJson(mutation);
    }
    return;
  }

  const candidate = [...journal.mutations, cloneJson(mutation)];
  if (fitsMutationBudget(candidate, journal.budget)) {
    journal.mutations = candidate;
    if (journal.precision === 'exact') journal.precision = 'intensional';
    return;
  }

  journal.mutations = widenMutations(candidate, journal.budget);
  journal.precision = 'widened';
};

const resolveMutationJournalBudget = (): MutationJournalBudget => {
  const configured = getServerRuntimeConfig().mutationJournal;
  const maxEntries = configured.maxEntries ?? 64;
  const maxBytes = configured.maxBytes ?? 64 * 1024;
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('Mutation journal maxEntries must be a positive integer.');
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 128) {
    throw new TypeError('Mutation journal maxBytes must be an integer of at least 128.');
  }
  return { maxEntries, maxBytes };
};

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

  const journal: UnitOfWorkMutationJournal = {
    mutations: [],
    precision: 'exact',
    sealed: false,
    budget: resolveMutationJournalBudget(),
  };
  const created: UnitOfWork = {
    resources: createContextResourceApi(resources),
    refs: createUnitOfWorkRefResolutionApi(),
    mutations: {
      declare: command =>
        appendMutation(journal, {
          effect: { kind: 'graph-command', request: toGraphCommandRequest(command) },
          provenance: 'declared',
        }),
      changed: selection =>
        appendMutation(journal, {
          effect: { kind: 'selection-change', selection },
          provenance: 'declared',
        }),
      snapshot: () => mutationSetFrom(journal),
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
  appendMutation(journal, {
    effect: { kind: 'graph-command', request: toGraphCommandRequest(command) },
    provenance: 'captured',
  });
  return true;
};

export const recordAppliedMutationOutcome = (outcome: AppliedMutationOutcome): boolean =>
  recordAppliedGraphCommand(outcome.command);

export const declareGraphMutation = (command: GraphCommandRequest['command']): void => {
  getRequiredUnitOfWork().mutations.declare(command);
};

export const declareSelectionChange = (selection: SelectionAst): void => {
  getRequiredUnitOfWork().mutations.changed(selection);
};

export const sealCurrentUnitOfWorkMutationJournal = (): CommittedMutationSet => {
  const unitOfWork = getRequiredUnitOfWork();
  const journal = mutationJournalFor(unitOfWork);
  journal.sealed = true;
  return mutationSetFrom(journal);
};

export const commitMutationSetToCurrentUnitOfWork = (set: CommittedMutationSet): void => {
  const journal = mutationJournalFor(getRequiredUnitOfWork());
  if (journal.sealed) throw new Error('UnitOfWork mutation journal is already sealed');
  if (set.precision === 'widened') {
    journal.mutations = widenMutations([...journal.mutations, ...set.mutations], journal.budget);
    journal.precision = 'widened';
    return;
  }
  for (const mutation of set.mutations) appendMutation(journal, mutation);
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
