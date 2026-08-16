export type MetadataAnalysis<TDefinition extends Record<string, unknown>> = {
  definition?: TDefinition;
  diagnostics: readonly string[];
  [key: string]: unknown;
};

export type MetadataAnalyzerOptions = {
  sourcePath?: string;
  resolveImportSource?: (
    fromSourcePath: string,
    importPath: string,
  ) => { sourcePath: string; sourceText: string } | undefined;
};

export const analyzeExportedStringConstant: (
  sourceText: string,
  exportName: string,
  options?: MetadataAnalyzerOptions,
) => { value?: string; diagnostics: readonly string[] };

export const analyzeExportedTaskStep: (
  sourceText: string,
  exportName: string,
  options?: MetadataAnalyzerOptions,
) => MetadataAnalysis<{ id: string }>;

export const analyzeSpecificDomainEntityExport: (
  sourceText: string,
  exportName: string,
  options?: MetadataAnalyzerOptions,
) => MetadataAnalysis<{
  entityName: string;
  entityExportName: string;
  operations: readonly Record<string, unknown>[];
  tasks?: readonly Record<string, unknown>[];
  ingress?: readonly Record<string, unknown>[];
}> | null;

export const analyzeSpecificViewExport: (
  sourceText: string,
  exportName: string,
  options?: MetadataAnalyzerOptions,
) => MetadataAnalysis<{
  kind: 'view';
  name: string;
  declaration: string;
  sourcePath?: string;
  entityName: string;
  schemaText: string;
}>;

export const analyzeGraphApiModule: (sourceText: string) => MetadataAnalysis<{
  apiExportName?: string;
  entities: readonly {
    entityExportName: string;
    importedIdentifier: string;
    importPath: string;
  }[];
  views: readonly {
    viewExportName: string;
    importedIdentifier: string;
    importPath: string;
  }[];
}>;
