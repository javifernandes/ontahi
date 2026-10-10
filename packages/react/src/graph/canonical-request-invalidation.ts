'use client';

import { normalizeGraphSchemaClientInput, type GraphCommandRequest } from '@ontahi/core/data-graph';
import type { ModelCommandCanonicalRequest } from '@ontahi/core/runtime/protocol';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  resolveOperationBridgeInvalidationQueryKeys,
  type BridgedOperationLike,
} from '../actions/index.js';

export type CanonicalRequestInvalidation = {
  readonly kind: 'read' | 'graph-command' | 'operation';
  readonly queryKeys: readonly QueryKey[];
};

const graphCommandEntityNames = (request: GraphCommandRequest): readonly string[] => {
  const command = request.command;
  if (command.kind === 'entity-mutation-command') return [command.entityName];
  return [...new Set([command.relation.sourceEntityName, command.relation.targetEntityName])];
};

const invalidateQueryKeys = async (queryClient: QueryClient, queryKeys: readonly QueryKey[]) => {
  await Promise.all(queryKeys.map(queryKey => queryClient.invalidateQueries({ queryKey })));
};

export const invalidateCanonicalRequest = async (
  queryClient: QueryClient,
  request: ModelCommandCanonicalRequest,
  operations: ReadonlyMap<string, BridgedOperationLike<any, any>>,
): Promise<CanonicalRequestInvalidation> => {
  if (request.kind === 'graph-read') return { kind: 'read', queryKeys: [] };

  if (request.kind === 'graph-command') {
    const queryKeys = graphCommandEntityNames(request).map(entityName => [entityName]);
    await invalidateQueryKeys(queryClient, queryKeys);
    return { kind: 'graph-command', queryKeys };
  }

  const operation = operations.get(request.operationId);
  if (!operation)
    throw new Error(`No client Operation is registered for "${request.operationId}".`);

  const input = operation.input
    ? normalizeGraphSchemaClientInput(operation.input, request.input)
    : request.input;
  const queryKeys = resolveOperationBridgeInvalidationQueryKeys(operation, input);
  await invalidateQueryKeys(queryClient, queryKeys);
  return { kind: 'operation', queryKeys };
};

/**
 * @deprecated Compatibility fallback for receivers without committed mutation metadata. Prefer
 * semantic mutation hooks or `invalidateSemanticGraphReads` with Runtime Protocol metadata.
 */
export const useCanonicalRequestInvalidation = (
  operations: readonly BridgedOperationLike<any, any>[],
) => {
  const queryClient = useQueryClient();
  const operationMap = useMemo(
    () => new Map(operations.map(operation => [operation.id, operation])),
    [operations],
  );

  return useCallback(
    (request: ModelCommandCanonicalRequest) =>
      invalidateCanonicalRequest(queryClient, request, operationMap),
    [operationMap, queryClient],
  );
};
