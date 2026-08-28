import type { AnalyzedEntity, AnalyzedNamedDefinition, AnalyzedTask } from './contracts.mjs';

export const renderGeneratedClientEntityModule: (input: {
  entities: readonly AnalyzedEntity[];
  schemaEntities?: readonly AnalyzedEntity[];
  namedDefinitions?: readonly AnalyzedNamedDefinition[];
  schemaImportPath?: string;
  operationContracts?: string;
  operationConditionsImportPath?: string;
}) => string;

export const renderGeneratedOperationConditionRegistryModule: (input: {
  operations: readonly import('./contracts.mjs').AnalyzedOperation[];
}) => string;

export const renderGeneratedTaskDefinitionRegistryModule: (input: {
  tasks: readonly AnalyzedTask[];
}) => string;
