import type { AnalyzedEntity, AnalyzedTask } from './contracts.mjs';

export const renderGeneratedClientEntityModule: (input: {
  entities: readonly AnalyzedEntity[];
  schemaEntities?: readonly AnalyzedEntity[];
  schemaImportPath?: string;
  operationContracts?: string;
}) => string;

export const renderGeneratedTaskDefinitionRegistryModule: (input: {
  tasks: readonly AnalyzedTask[];
}) => string;
