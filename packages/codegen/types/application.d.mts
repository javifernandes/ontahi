import type {
  CodegenDiagnostic,
  OntahiApplicationAnalysis,
  OntahiSourceLoader,
} from './contracts.mjs';

export const formatCodegenDiagnostic: (diagnostic: CodegenDiagnostic) => string;

export const analyzeOntahiApplication: (input: {
  graphApiPath: string;
  sourceLoader: OntahiSourceLoader;
}) => OntahiApplicationAnalysis;
