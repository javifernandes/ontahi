export type CodegenDiagnostic = {
  code: string;
  message: string;
  sourcePath?: string;
  declaration?: string;
  importPath?: string;
};

export type SourceModule = {
  sourcePath: string;
  sourceText: string;
};

export type OntahiSourceLoader = {
  readSource(sourcePath: string): SourceModule;
  resolveImportSource(fromSourcePath: string, importPath: string): SourceModule | undefined;
};

export type AnalyzedOperation = {
  name: string;
  entityName?: string;
  entityExportName?: string;
  sourcePath?: string;
  exposure?: string;
  [key: string]: unknown;
};

export type AnalyzedTask = {
  entityName?: string;
  entityExportName?: string;
  sourcePath?: string;
  taskId?: string;
  steps?: readonly Record<string, unknown>[];
  [key: string]: unknown;
};

export type AnalyzedEntity = {
  entityName: string;
  entityExportName?: string;
  sourcePath?: string;
  operations: readonly AnalyzedOperation[];
  tasks?: readonly AnalyzedTask[];
  [key: string]: unknown;
};

export type OntahiApplicationAnalysis = {
  kind: 'ontahi-application-analysis';
  graph: {
    sourcePath: string;
    entities: readonly Record<string, unknown>[];
  };
  entities: readonly AnalyzedEntity[];
  operations: readonly AnalyzedOperation[];
  clientEntities: readonly AnalyzedEntity[];
  tasks: readonly AnalyzedTask[];
  ingress: readonly Record<string, unknown>[];
  sourcePaths: readonly string[];
  diagnostics: readonly CodegenDiagnostic[];
};

export type GeneratedOutput = {
  outputPath: string;
  source: string;
};

export type CodegenTarget = {
  name: string;
  sourcePath: string;
  [key: string]: unknown;
};
