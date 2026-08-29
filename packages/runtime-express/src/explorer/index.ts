import type { EntityMutationCommandPolicy } from '@ontahi/core/data-graph';
import type {
  ExplorerEntityDetail,
  ExplorerEntityMutationDescriptor,
} from '@ontahi/explorer-react/contracts';
import { buildExplorerSnapshot, getExplorerEntityDetail } from '@ontahi/explorer-react/server';

import type { OntahiExpressExplorerOptions } from '../application.js';

export type CreateOntahiExpressExplorerOptions = Omit<
  OntahiExpressExplorerOptions,
  'buildSnapshot'
>;

const isEntityMutationPolicy = (policy: unknown): policy is EntityMutationCommandPolicy<any> =>
  typeof policy === 'object' &&
  policy !== null &&
  'actions' in policy &&
  !Array.isArray(policy.actions);

const describeEntityMutations = (
  entityName: string,
  policies: readonly unknown[],
): ExplorerEntityMutationDescriptor | undefined => {
  const policy = policies.find(
    candidate => isEntityMutationPolicy(candidate) && candidate.entity.name === entityName,
  );
  if (!policy || !isEntityMutationPolicy(policy)) return undefined;

  return {
    ...(policy.actions.create ? { create: { fields: [...policy.actions.create.fields] } } : {}),
    ...(policy.actions.update ? { update: { fields: [...policy.actions.update.fields] } } : {}),
    ...(policy.actions.delete ? { delete: true as const } : {}),
  };
};

const withEntityMutations = (
  detail: ExplorerEntityDetail,
  policies: readonly unknown[],
): ExplorerEntityDetail => {
  const mutations = describeEntityMutations(detail.name, policies);
  return mutations ? { ...detail, mutations } : detail;
};

const buildApplicationExplorerSnapshot: OntahiExpressExplorerOptions['buildSnapshot'] = (
  application,
  context,
) => {
  const { graph } = application;
  const entities = graph.listEntities();
  const graphSummary = graph.describe();

  return {
    snapshot: buildExplorerSnapshot({
      entities,
      graphSummary,
      graphOperations: graph.listGraphOperations(),
      domainOperations: graph.listDomainOperations(),
      tasks: graph.listTaskDefinitions(),
      httpIngress: graph.listHttpIngress(),
    }),
    entityDetails: entities
      .map(entity => getExplorerEntityDetail({ entities, graphSummary }, entity.name))
      .filter(detail => detail !== null)
      .map(detail => withEntityMutations(detail, context?.graphCommandPolicies ?? [])),
  };
};

export const createOntahiExpressExplorer = (
  options: CreateOntahiExpressExplorerOptions = {},
): OntahiExpressExplorerOptions => ({
  ...options,
  buildSnapshot: buildApplicationExplorerSnapshot,
});
