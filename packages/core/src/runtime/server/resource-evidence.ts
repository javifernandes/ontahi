import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  ModelResourceActivity,
  ModelResourceAttemptEvidence,
  ModelCommandResourceEvidence,
  ModelResourceUsage,
  ResourceAttemptEvidence,
  ResourceEvidence,
  ResourceEvidenceDisclosure,
  ResourceEvidenceSummary,
  ServiceResourceAttemptEvidence,
} from '../contracts.js';

type ResourceEvidenceState = {
  readonly disclosure: ResourceEvidenceDisclosure;
  readonly attempts: ResourceAttemptEvidence[];
  readonly suppressedAttempts: Map<string, number>;
};

const storage = new AsyncLocalStorage<ResourceEvidenceState>();
const disclosureRank: Record<ResourceEvidenceDisclosure, number> = {
  none: 0,
  summary: 1,
  debug: 2,
};
const MODEL_RESOURCE_KEY = 'model:model';

const resourceKey = (kind: ResourceAttemptEvidence['kind'], resourceId: string) =>
  `${kind}:${resourceId}`;

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
        attempts: parent.attempts,
        suppressedAttempts: parent.suppressedAttempts,
      },
      run,
    );
  return storage.run(
    {
      disclosure: disclosure ?? 'none',
      attempts: [],
      suppressedAttempts: new Map(),
    },
    run,
  );
};

const incrementSuppressedAttempt = (state: ResourceEvidenceState, key: string) =>
  state.suppressedAttempts.set(key, (state.suppressedAttempts.get(key) ?? 0) + 1);

const validateEvidenceIdentity = (name: string, value: string | undefined): void => {
  if (value !== undefined && (value.length === 0 || value.length > 256))
    throw new RangeError(`${name} must contain between 1 and 256 characters.`);
};

export const validateServiceResourceAttemptEvidence = (
  attempt: Pick<ServiceResourceAttemptEvidence, 'resourceId' | 'provider' | 'action'>,
): void => {
  validateEvidenceIdentity('resourceId', attempt.resourceId);
  validateEvidenceIdentity('provider', attempt.provider);
  validateEvidenceIdentity('action', attempt.action);
};

export const recordServiceResourceAttempt = (
  attempt: Omit<ServiceResourceAttemptEvidence, 'kind' | 'outcome' | 'durationMs'>,
): ((outcome: 'completed' | 'failed', durationMs: number) => void) => {
  validateServiceResourceAttemptEvidence(attempt);
  const state = storage.getStore();
  if (!state) return () => undefined;
  const key = resourceKey('service', attempt.resourceId);
  if (state.disclosure === 'none') {
    incrementSuppressedAttempt(state, key);
    return () => undefined;
  }
  state.attempts.push({ kind: 'service', ...attempt, outcome: 'started' });
  const index = state.attempts.length - 1;
  return (outcome, durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs < 0)
      throw new RangeError('durationMs must be a finite non-negative number.');
    state.attempts[index] = { kind: 'service', ...attempt, outcome, durationMs };
  };
};

export const recordModelResourceAttempt = (
  activity: ModelResourceActivity | undefined,
): ((outcome: ModelResourceAttemptEvidence['outcome']) => void) => {
  const state = storage.getStore();
  if (!state) return () => undefined;
  if (state.disclosure === 'none') {
    incrementSuppressedAttempt(state, MODEL_RESOURCE_KEY);
    return () => undefined;
  }
  const attempt: ModelResourceAttemptEvidence = {
    kind: 'model',
    resourceId: 'model',
    outcome: 'started',
    ...(activity ? { activity } : {}),
    usageReported: false,
  };
  state.attempts.push(attempt);
  const index = state.attempts.length - 1;
  return outcome => {
    const current = state.attempts[index];
    if (current?.kind === 'model') state.attempts[index] = { ...current, outcome };
  };
};

const attachModelUsage = (attempts: ResourceAttemptEvidence[], usage: ModelResourceUsage): void => {
  const { activity, ...providerUsage } = usage;
  let index = -1;
  if (activity)
    for (let candidate = attempts.length - 1; candidate >= 0; candidate -= 1) {
      const attempt = attempts[candidate];
      if (attempt?.kind === 'model' && attempt.activity?.attemptId === activity.attemptId) {
        index = candidate;
        break;
      }
    }
  const existing = index < 0 ? undefined : attempts[index];
  if (existing?.kind === 'model') {
    attempts[index] = { ...existing, usage: providerUsage, usageReported: true };
    return;
  }
  attempts.push({
    kind: 'model',
    resourceId: 'model',
    outcome: 'completed',
    ...(activity ? { activity } : {}),
    usage: providerUsage,
    usageReported: true,
  });
};

export const recordModelResourceUsage = (usage: ModelResourceUsage): void => {
  const state = storage.getStore();
  if (state && state.disclosure !== 'none') attachModelUsage(state.attempts, usage);
};

const sumIfComplete = (
  values: readonly (number | undefined)[],
  complete: boolean,
): number | undefined =>
  complete && values.every((value): value is number => value !== undefined)
    ? values.reduce((total, value) => total + value, 0)
    : undefined;

const summarizeModel = (
  attempts: readonly ModelResourceAttemptEvidence[],
  hasSuppressedAttempts: boolean,
): ResourceEvidenceSummary => {
  const reported = attempts.filter(attempt => attempt.usageReported);
  const complete = !hasSuppressedAttempts && reported.length === attempts.length;
  const totalTokens = sumIfComplete(
    reported.map(attempt => attempt.usage?.totalTokens),
    complete,
  );
  const durationMs = sumIfComplete(
    reported.map(attempt => attempt.usage?.durationMs),
    complete,
  );
  const failedAttempts = attempts.filter(attempt => attempt.outcome === 'failed').length;
  return {
    kind: 'model',
    resourceId: 'model',
    attempts: attempts.length,
    reportedAttempts: reported.length,
    ...(failedAttempts === 0 ? {} : { failedAttempts }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
};

const summarizeService = (
  resourceId: string,
  attempts: readonly ServiceResourceAttemptEvidence[],
  hasSuppressedAttempts: boolean,
): ResourceEvidenceSummary => {
  const durationMs = sumIfComplete(
    attempts.map(attempt => attempt.durationMs),
    !hasSuppressedAttempts,
  );
  const failedAttempts = attempts.filter(attempt => attempt.outcome === 'failed').length;
  return {
    kind: 'service',
    resourceId,
    attempts: attempts.length,
    ...(failedAttempts === 0 ? {} : { failedAttempts }),
    ...(durationMs === undefined ? {} : { durationMs }),
  };
};

const projectAttempts = (
  attempts: readonly ResourceAttemptEvidence[],
  disclosure: ResourceEvidenceDisclosure,
  suppressedAttempts: ReadonlyMap<string, number>,
): ResourceEvidence | undefined => {
  if (disclosure === 'none' || attempts.length === 0) return undefined;
  if (disclosure === 'debug')
    return { visibility: 'debug', attempts: [attempts[0]!, ...attempts.slice(1)] };
  const modelAttempts = attempts.filter(
    (attempt): attempt is ModelResourceAttemptEvidence => attempt.kind === 'model',
  );
  const serviceAttempts = attempts.filter(
    (attempt): attempt is ServiceResourceAttemptEvidence => attempt.kind === 'service',
  );
  const resources: ResourceEvidenceSummary[] = [];
  if (modelAttempts.length > 0)
    resources.push(
      summarizeModel(modelAttempts, (suppressedAttempts.get(MODEL_RESOURCE_KEY) ?? 0) > 0),
    );
  const serviceAttemptsByResource = new Map<string, ServiceResourceAttemptEvidence[]>();
  for (const attempt of serviceAttempts) {
    const resourceAttempts = serviceAttemptsByResource.get(attempt.resourceId) ?? [];
    resourceAttempts.push(attempt);
    serviceAttemptsByResource.set(attempt.resourceId, resourceAttempts);
  }
  for (const [resourceId, resourceAttempts] of serviceAttemptsByResource) {
    resources.push(
      summarizeService(
        resourceId,
        resourceAttempts,
        (suppressedAttempts.get(resourceKey('service', resourceId)) ?? 0) > 0,
      ),
    );
  }
  return resources.length === 0
    ? undefined
    : { visibility: 'summary', resources: [resources[0]!, ...resources.slice(1)] };
};

/** Projects generalized evidence onto the released model-command v1 wire shape. */
export const toModelCommandResourceEvidence = (
  evidence: ResourceEvidence | undefined,
): ModelCommandResourceEvidence | undefined => {
  if (!evidence) return undefined;
  if (evidence.visibility === 'summary') {
    const summary = evidence.resources.find(resource => resource.kind === 'model');
    if (!summary || summary.kind !== 'model') return undefined;
    const { kind: _kind, resourceId: _resourceId, ...model } = summary;
    return { visibility: 'summary', model };
  }
  const modelAttempts = evidence.attempts.filter(
    (attempt): attempt is ModelResourceAttemptEvidence => attempt.kind === 'model',
  );
  if (modelAttempts.length === 0) return undefined;
  return {
    visibility: 'debug',
    model: {
      attempts: modelAttempts.flatMap(attempt =>
        attempt.usage
          ? [{ ...attempt.usage, ...(attempt.activity ? { activity: attempt.activity } : {}) }]
          : [],
      ),
      attemptOutcomes: modelAttempts.map(({ outcome, activity, usageReported }) => ({
        outcome,
        ...(activity ? { activity } : {}),
        usageReported,
      })),
    },
  };
};

export const projectResourceEvidence = (
  usage: readonly ModelResourceUsage[],
  disclosure: ResourceEvidenceDisclosure,
  outcomes: readonly {
    readonly outcome: ModelResourceAttemptEvidence['outcome'];
    readonly activity?: ModelResourceActivity;
    readonly usageReported: boolean;
  }[] = [],
  hasSuppressedAttempts = false,
): ResourceEvidence | undefined => {
  const attempts: ResourceAttemptEvidence[] = outcomes.map(outcome => ({
    kind: 'model',
    resourceId: 'model',
    ...outcome,
  }));
  for (const entry of usage) attachModelUsage(attempts, entry);
  return projectAttempts(
    attempts,
    disclosure,
    hasSuppressedAttempts ? new Map([[MODEL_RESOURCE_KEY, 1]]) : new Map(),
  );
};

export const projectCurrentResourceEvidence = (
  additionalUsage: readonly ModelResourceUsage[] = [],
): ResourceEvidence | undefined => {
  const state = storage.getStore();
  if (!state) return undefined;
  const attempts = [...state.attempts];
  for (const usage of additionalUsage) attachModelUsage(attempts, usage);
  return projectAttempts(attempts, state.disclosure, state.suppressedAttempts);
};

export const getCurrentResourceEvidenceDisclosure = (): ResourceEvidenceDisclosure =>
  storage.getStore()?.disclosure ?? 'none';
