import {
  resolveOperationConditionContracts,
  type PortableOperationConditionRegistry,
} from '../../../computation/expression/condition.js';
import type { DomainOperationDeclarations } from '../domain-operations.js';

export const materializeDomainOperationConditions = <
  TOperations extends DomainOperationDeclarations,
>(
  entityName: string,
  operations: TOperations,
  registry?: PortableOperationConditionRegistry,
): TOperations =>
  Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => {
      const { contracts, ...portableOperation } = operation;
      const conditions = resolveOperationConditionContracts(
        `${entityName}.${name}`,
        contracts,
        registry,
      );
      return [name, { ...portableOperation, ...(conditions ? { conditions } : {}) }];
    }),
  ) as TOperations;
