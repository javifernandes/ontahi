import type { FileSystemSourceLoaderOptions } from './source-loader.mjs';
import type { CodegenRunner, CodegenRunnerOptions } from './runner.mjs';
import type { CodegenTarget } from './contracts.mjs';

export type ClientEntityCodegenOptions = {
  rootDir?: string;
  graphApiPath?: string;
  outputPath?: string;
  schemaImportPath?: string;
  operationContracts?: 'all' | 'selection' | 'none';
  aliases?: FileSystemSourceLoaderOptions['aliases'];
  formatter?: 'oxfmt';
  formatOutput?: CodegenRunnerOptions<CodegenTarget>['formatOutput'];
  staleCommand?: string;
};

export const createClientEntityCodegenRunner: (
  options?: ClientEntityCodegenOptions,
) => CodegenRunner;

export const parseClientEntityCodegenArguments: (argv?: readonly string[]) => {
  help: boolean;
  options: Pick<
    ClientEntityCodegenOptions,
    'graphApiPath' | 'outputPath' | 'schemaImportPath' | 'formatter'
  >;
  runnerArguments: string[];
};

export const runClientEntityCodegenCli: (options?: {
  argv?: readonly string[];
  logger?: Pick<Console, 'log'>;
}) => Promise<void>;
