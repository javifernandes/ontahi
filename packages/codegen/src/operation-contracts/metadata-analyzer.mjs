// Static analysis for the TypeScript/JavaScript Ontahi declaration DSL.
import { findDomainEntityDefinition } from './domain-entity-analysis.mjs';
import { discoverGraphApi } from './graph-discovery.mjs';
import { parseTypeScriptSource } from './source-parsing.mjs';

export {
  analyzeExportedStringConstant,
  analyzeExportedTaskStep,
} from './task-analysis.mjs';

export const analyzeSpecificDomainEntityExport = (sourceText, exportName, options = {}) => {
  const { sourceFile, diagnostics } = parseTypeScriptSource(
    sourceText,
    options.sourcePath ?? 'domain-entity-module.ts',
  );

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return findDomainEntityDefinition(sourceFile, exportName, {
    ...options,
    strict: false,
    includeTasks: true,
  });
};

export const analyzeGraphApiModule = sourceText => {
  const { sourceFile, diagnostics } = parseTypeScriptSource(sourceText, 'graph-api-module.ts');

  if (diagnostics.length > 0) {
    return { diagnostics };
  }

  return discoverGraphApi(sourceFile);
};
