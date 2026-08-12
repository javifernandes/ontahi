import type {
  CodegenDiagnostic,
  CodegenTarget,
  GeneratedOutput,
  OntahiApplicationAnalysis,
} from './contracts.mjs';

export type CodegenRunnerOptions<TTarget extends CodegenTarget> = {
  targets: readonly TTarget[];
  analyzeApplication(sourcePath: string):
    | OntahiApplicationAnalysis
    | Promise<OntahiApplicationAnalysis>;
  renderTarget(input: {
    application: OntahiApplicationAnalysis;
    target: TTarget;
  }):
    | { outputs?: readonly GeneratedOutput[]; diagnostics?: readonly unknown[] }
    | Promise<{ outputs?: readonly GeneratedOutput[]; diagnostics?: readonly unknown[] }>;
  formatOutput?(input: {
    application: OntahiApplicationAnalysis;
    outputPath: string;
    source: string;
    target: TTarget;
  }): string | Promise<string>;
  formatAnalysisDiagnostic?(diagnostic: CodegenDiagnostic): string;
  formatTargetDiagnostic?(diagnostic: unknown): string;
  staleCommand?: string;
  watchDebounceMs?: number;
  watchIntervalMs?: number;
  logger?: Pick<Console, 'log' | 'error'>;
};

export type CodegenRunner = {
  collectWatchPaths(targets?: readonly CodegenTarget[]): Promise<string[]>;
  generate(options?: {
    check?: boolean;
    onlyTargetName?: string;
    targets?: readonly CodegenTarget[];
  }): Promise<{ driftedOutputs: string[] }>;
  runCli(options?: { argv?: readonly string[] }): Promise<void>;
  watch(options?: { onlyTargetName?: string }): Promise<void>;
};

export const parseCodegenRunnerArguments: (argv?: readonly string[]) => {
  check: boolean;
  onlyTargetName?: string;
  watch: boolean;
};

export const createStdinCommandFormatter: (input: {
  command: string;
  args: readonly string[];
  cwd: string;
  label?: string;
}) => (input: { outputPath: string; source: string }) => Promise<string>;

export const createOntahiCodegenRunner: <TTarget extends CodegenTarget>(
  options: CodegenRunnerOptions<TTarget>,
) => CodegenRunner;
