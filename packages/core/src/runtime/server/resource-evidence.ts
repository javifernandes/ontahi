import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  ModelResourceActivity,
  ModelResourceAttemptOutcome,
  ModelResourceUsage,
  ResourceEvidence,
  ResourceEvidenceDisclosure,
  ServiceResourceAttempt,
} from '../contracts.js';

type ResourceEvidenceState = {
  readonly disclosure: ResourceEvidenceDisclosure;
  readonly modelUsage: ModelResourceUsage[];
  readonly modelAttemptOutcomes: ModelResourceAttemptOutcome[];
  readonly suppressedModelAttempts: { count: number };
  readonly serviceAttempts: ServiceResourceAttempt[];
  readonly suppressedServiceAttempts: { count: number };
};

const storage = new AsyncLocalStorage<ResourceEvidenceState>();
const disclosureRank: Record<ResourceEvidenceDisclosure, number> = {
  none: 0,
  summary: 1,
  debug: 2,
};

const narrowDisclosure = (
  parent: ResourceEvidenceDisclosure,
  requested: ResourceEvidenceDisclosure | undefined,
): ResourceEvidenceDisclosure =>
  requested === undefined || disclosureRank[parent] <= disclosureRank[requested]
    ? parent
    : requested;

export const withResourceEvidence = <TValue>(
  disclosure: ResourceEvidenceDisclosure | undefined,
  run: () => TValue,
): TValue => {
  const parent = storage.getStore();
  if (parent)
    return storage.run(
      {
        disclosure: narrowDisclosure(parent.disclosure, disclosure),
        modelUsage: parent.modelUsage,
        modelAttemptOutcomes: parent.modelAttemptOutcomes,
        suppressedModelAttempts: parent.suppressedModelAttempts,
        serviceAttempts: parent.serviceAttempts,
        suppressedServiceAttempts: parent.suppressedServiceAttempts,
      },
      run,
    );
  return storage.run(
    {
      disclosure: disclosure ?? 'none',
      modelUsage: [],
      modelAttemptOutcomes: [],
      suppressedModelAttempts: { count: 0 },
      serviceAttempts: [],
      suppressedServiceAttempts: { count: 0 },
    },
    run,
  );
};

export const recordServiceResourceAttempt = (
  attempt: Omit<ServiceResourceAttempt, 'outcome' | 'durationMs'>,
): ((outcome: 'completed' | 'failed', durationMs: number) => void) => {
  const state = storage.getStore();
  if (!state) return () => undefined;
  if (state.disclosure === 'none') {
    state.suppressedServiceAttempts.count += 1;
    return () => undefined;
  }
  state.serviceAttempts.push({ ...attempt, outcome: 'started' });
  const index = state.serviceAttempts.length - 1;
  return (outcome, durationMs) => {
    state.serviceAttempts[index] = { ...attempt, outcome, durationMs };
  };
};

export const recordModelResourceAttempt = (
  activity: ModelResourceActivity | undefined,
): ((outcome: ModelResourceAttemptOutcome['outcome']) => void) => {
  const state = storage.getStore();
  if (!state) return () => undefined;
  if (state.disclosure === 'none') {
    state.suppressedModelAttempts.count += 1;
    return () => undefined;
  }
  const attempt: {
    outcome: ModelResourceAttemptOutcome['outcome'];
    activity?: ModelResourceActivity;
  } = {
    outcome: 'started',
    ...(activity ? { activity } : {}),
  };
  state.modelAttemptOutcomes.push({ ...attempt, usageReported: false });
  const index = state.modelAttemptOutcomes.length - 1;
  return outcome => {
    const usageReported = state.modelUsage.some(
      usage => activity !== undefined && usage.activity?.attemptId === activity.attemptId,
    );
    state.modelAttemptOutcomes[index] = { ...attempt, outcome, usageReported };
  };
};

export const recordModelResourceUsage = (usage: ModelResourceUsage): void => {
  const state = storage.getStore();
  if (state && state.disclosure !== 'none') state.modelUsage.push(usage);
};

const sumIfComplete = (
  usage: readonly ModelResourceUsage[],
  select: (entry: ModelResourceUsage) => number | undefined,
) => {
  const values = usage.map(select);
  return values.every((value): value is number => value !== undefined)
    ? values.reduce((total, value) => total + value, 0)
    : undefined;
};

export const projectResourceEvidence = (
  usage: readonly ModelResourceUsage[],
  disclosure: ResourceEvidenceDisclosure,
  attemptOutcomes: readonly ModelResourceAttemptOutcome[] = [],
  hasSuppressedAttempts = false,
): ResourceEvidence | undefined => {
  if (disclosure === 'none' || (usage.length === 0 && attemptOutcomes.length === 0))
    return undefined;
  const projectedAttemptOutcomes = attemptOutcomes.map(attempt => ({
    ...attempt,
    usageReported:
      attempt.usageReported ||
      (attempt.activity !== undefined &&
        usage.some(entry => entry.activity?.attemptId === attempt.activity?.attemptId)),
  }));
  if (disclosure === 'debug')
    return {
      visibility: 'debug',
      model: {
        attempts: [...usage],
        ...(projectedAttemptOutcomes.length === 0
          ? {}
          : { attemptOutcomes: projectedAttemptOutcomes }),
      },
    };

  const attempts = attemptOutcomes.length || usage.length;
  const reportedAttempts =
    projectedAttemptOutcomes.length === 0
      ? usage.length
      : projectedAttemptOutcomes.filter(attempt => attempt.usageReported).length;
  const complete = !hasSuppressedAttempts && reportedAttempts === attempts;
  const totalTokens = complete ? sumIfComplete(usage, entry => entry.totalTokens) : undefined;
  const durationMs = complete ? sumIfComplete(usage, entry => entry.durationMs) : undefined;
  const failedAttempts = projectedAttemptOutcomes.filter(
    attempt => attempt.outcome === 'failed',
  ).length;
  return {
    visibility: 'summary',
    model: {
      attempts,
      ...(attemptOutcomes.length === 0 ? {} : { reportedAttempts }),
      ...(failedAttempts === 0 ? {} : { failedAttempts }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
      ...(durationMs === undefined ? {} : { durationMs }),
    },
  };
};

export const projectCurrentResourceEvidence = (
  additionalUsage: readonly ModelResourceUsage[] = [],
): ResourceEvidence | undefined => {
  const state = storage.getStore();
  if (!state) return undefined;
  const model = projectResourceEvidence(
    [...additionalUsage, ...state.modelUsage],
    state.disclosure,
    state.modelAttemptOutcomes,
    state.suppressedModelAttempts.count > 0,
  );
  if (state.disclosure === 'none') return undefined;
  const services =
    state.disclosure === 'debug'
      ? [...state.serviceAttempts]
      : [...new Set(state.serviceAttempts.map(attempt => attempt.resourceId))].map(resourceId => {
          const attempts = state.serviceAttempts.filter(
            attempt => attempt.resourceId === resourceId,
          );
          const durations = attempts.map(attempt => attempt.durationMs);
          const durationMs =
            state.suppressedServiceAttempts.count === 0 &&
            durations.every((duration): duration is number => duration !== undefined)
              ? durations.reduce((total, duration) => total + duration, 0)
              : undefined;
          const failedAttempts = attempts.filter(attempt => attempt.outcome === 'failed').length;
          return {
            resourceId,
            attempts: attempts.length,
            ...(failedAttempts === 0 ? {} : { failedAttempts }),
            ...(durationMs === undefined ? {} : { durationMs }),
          };
        });
  if (!model && services.length === 0) return undefined;
  return {
    visibility: state.disclosure,
    ...(model?.model ? { model: model.model } : {}),
    ...(services.length === 0 ? {} : { services }),
  } as ResourceEvidence;
};

export const getCurrentResourceEvidenceDisclosure = (): ResourceEvidenceDisclosure =>
  storage.getStore()?.disclosure ?? 'none';
