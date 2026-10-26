import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  ModelResourceUsage,
  ResourceEvidence,
  ResourceEvidenceDisclosure,
} from '../contracts.js';

type ResourceEvidenceState = {
  readonly disclosure: ResourceEvidenceDisclosure;
  readonly modelUsage: ModelResourceUsage[];
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
      },
      run,
    );
  return storage.run({ disclosure: disclosure ?? 'none', modelUsage: [] }, run);
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
): ResourceEvidence | undefined => {
  if (disclosure === 'none' || usage.length === 0) return undefined;
  if (disclosure === 'debug') return { visibility: 'debug', model: { attempts: [...usage] } };

  const totalTokens = sumIfComplete(usage, entry => entry.totalTokens);
  const durationMs = sumIfComplete(usage, entry => entry.durationMs);
  return {
    visibility: 'summary',
    model: {
      attempts: usage.length,
      ...(totalTokens === undefined ? {} : { totalTokens }),
      ...(durationMs === undefined ? {} : { durationMs }),
    },
  };
};

export const projectCurrentResourceEvidence = (): ResourceEvidence | undefined => {
  const state = storage.getStore();
  return state ? projectResourceEvidence(state.modelUsage, state.disclosure) : undefined;
};

export const getCurrentResourceEvidenceDisclosure = (): ResourceEvidenceDisclosure =>
  storage.getStore()?.disclosure ?? 'none';
