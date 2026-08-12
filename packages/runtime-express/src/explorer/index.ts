import type { OntahiApplication } from '@ontahi/core/runtime/server';
import { buildExplorerSnapshot, getExplorerEntityDetail } from '@ontahi/explorer-react/server';

import type { OntahiExpressExplorerOptions } from '../application.js';

export type CreateOntahiExpressExplorerOptions = Omit<
  OntahiExpressExplorerOptions,
  'buildSnapshot'
>;

const buildApplicationExplorerSnapshot = (application: OntahiApplication) => {
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
      .filter(detail => detail !== null),
  };
};

export const createOntahiExpressExplorer = (
  options: CreateOntahiExpressExplorerOptions = {},
): OntahiExpressExplorerOptions => ({
  ...options,
  buildSnapshot: buildApplicationExplorerSnapshot,
});
