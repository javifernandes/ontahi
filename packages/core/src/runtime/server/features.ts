import type {
  OperationFeatureRequirement,
  OperationInput,
  OperationRequirement,
} from './operation/requirement-types.js';

export type Feature = {
  id: string;
  providerKey: string;
  description: string;
  defaultValue: boolean;
};

export type GraphFeatureOperation = {
  id: string;
  description?: string;
  requires?: ReadonlyArray<Pick<OperationRequirement<OperationInput>, 'feature'>>;
};

export type CollectFeaturesFromGraphOptions = {
  deriveProviderKey?: (featureId: string) => string;
};

export const deriveFeatureProviderKey = (featureId: string) =>
  featureId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const resolveFeature = (
  operation: Pick<GraphFeatureOperation, 'id' | 'description'>,
  requirement: OperationFeatureRequirement,
  deriveProviderKey: (featureId: string) => string,
): Feature => {
  const featureId = requirement.id ?? operation.id;

  return {
    id: featureId,
    providerKey: requirement.providerKey ?? deriveProviderKey(featureId),
    description: requirement.description ?? operation.description ?? `Feature ${featureId}`,
    defaultValue: requirement.defaultValue ?? false,
  };
};

export const collectFeaturesFromGraphOperations = (
  operations: Iterable<GraphFeatureOperation>,
  options?: CollectFeaturesFromGraphOptions,
): Feature[] => {
  const features = new Map<string, Feature>();
  const deriveProviderKey = options?.deriveProviderKey ?? deriveFeatureProviderKey;

  for (const operation of operations) {
    for (const requirement of operation.requires ?? []) {
      if (!requirement.feature) {
        continue;
      }

      const feature = resolveFeature(operation, requirement.feature, deriveProviderKey);
      if (!features.has(feature.id)) {
        features.set(feature.id, feature);
      }
    }
  }

  return [...features.values()];
};

export const collectFeaturesFromGraph = (
  graph: {
    listDomainOperations: () => Iterable<GraphFeatureOperation>;
  },
  options?: CollectFeaturesFromGraphOptions,
): Feature[] => collectFeaturesFromGraphOperations(graph.listDomainOperations(), options);
