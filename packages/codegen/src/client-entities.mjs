import path from 'node:path';

import { analyzeOntahiApplication } from './application-analysis.mjs';
import { renderGeneratedOperationConditionRegistryModule } from './model-expression/registry-module.mjs';
import { renderGeneratedClientEntityModule } from './projections.mjs';
import { createOntahiCodegenRunner, createStdinCommandFormatter } from './runner.mjs';
import { createFileSystemSourceLoader } from './source-loader.mjs';

const conventionalGraphApiPath = 'src/graph.ts';
const conventionalOutputPath = 'src/generated/client-entities.ts';
const clientEntityCodegenHelp = `Usage: ontahi-codegen [options]

Generate browser-safe entities from an Ontahi application.

Options:
  --graph <path>          Composition root (default: src/graph.ts)
  --output <path>         Generated module (default: src/generated/client-entities.ts)
  --schema-import <path>  Fallback import for external entity schemas
  --operation-conditions-output <path>
                          Shared portable condition registry module
  --operation-conditions-only
                          Generate only the portable condition registry
  --format oxfmt          Format through the host project's oxfmt binary
  --check                 Fail when generated output is stale
  --watch                 Regenerate when application sources change
  --help                  Show this help
`;

const resolveFormatter = ({ formatter, rootDir }) => {
  if (!formatter) return undefined;

  if (formatter === 'oxfmt') {
    return createStdinCommandFormatter({
      command: 'oxfmt',
      args: ({ outputPath }) => ['--stdin-filepath', outputPath],
      cwd: rootDir,
      label: 'oxfmt',
    });
  }

  throw new Error(`Unknown Ontahi client codegen formatter: ${formatter}`);
};

export const createClientEntityCodegenRunner = ({
  rootDir = process.cwd(),
  graphApiPath = conventionalGraphApiPath,
  outputPath = conventionalOutputPath,
  schemaImportPath = './schema',
  operationContracts = 'all',
  operationConditionsOutputPath,
  operationConditionsOnly = false,
  aliases,
  formatter,
  formatOutput,
  staleCommand = 'pnpm run codegen',
} = {}) => {
  if (formatter && formatOutput) {
    throw new Error('Use either formatter or formatOutput for Ontahi client codegen, not both.');
  }
  if (operationConditionsOnly && !operationConditionsOutputPath) {
    throw new Error('--operation-conditions-only requires --operation-conditions-output.');
  }

  const resolvedRoot = path.resolve(rootDir);
  const resolvedGraphApiPath = path.resolve(resolvedRoot, graphApiPath);
  const resolvedOutputPath = path.resolve(resolvedRoot, outputPath);
  const resolvedOperationConditionsOutputPath = operationConditionsOutputPath
    ? path.resolve(resolvedRoot, operationConditionsOutputPath)
    : undefined;
  const sourceLoader = createFileSystemSourceLoader({ rootDir: resolvedRoot, aliases });
  const target = {
    name: operationConditionsOnly ? 'operation-conditions' : 'client-entities',
    sourcePath: resolvedGraphApiPath,
    outputPath: resolvedOperationConditionsOutputPath ?? resolvedOutputPath,
  };

  return createOntahiCodegenRunner({
    targets: [target],
    analyzeApplication: sourcePath =>
      analyzeOntahiApplication({ graphApiPath: sourcePath, sourceLoader }),
    renderTarget: ({ application }) => {
      const hasOperationConditions = application.operations.some(
        operation => operation.conditions?.pre?.length,
      );
      if (hasOperationConditions && !resolvedOperationConditionsOutputPath) {
        return {
          diagnostics: [
            'Portable Operation conditions require --operation-conditions-output so server and generated clients consume one artifact.',
          ],
          outputs: [],
        };
      }
      const conditionImportPath = resolvedOperationConditionsOutputPath
        ? (() => {
            const relative = path
              .relative(path.dirname(resolvedOutputPath), resolvedOperationConditionsOutputPath)
              .replaceAll(path.sep, '/')
              .replace(/\.(?:mts|ts)$/, '.js');
            return relative.startsWith('.') ? relative : `./${relative}`;
          })()
        : undefined;

      return {
        diagnostics: [],
        outputs: [
          ...(operationConditionsOnly
            ? []
            : [
                {
                  outputPath: resolvedOutputPath,
                  source: renderGeneratedClientEntityModule({
                    entities: application.clientEntities,
                    schemaEntities: application.entities,
                    namedDefinitions: application.namedDefinitions,
                    schemaImportPath,
                    operationContracts,
                    operationConditionsImportPath: conditionImportPath,
                  }),
                },
              ]),
          ...(resolvedOperationConditionsOutputPath
            ? [
                {
                  outputPath: resolvedOperationConditionsOutputPath,
                  source: renderGeneratedOperationConditionRegistryModule({
                    operations: application.operations,
                  }),
                },
              ]
            : []),
        ],
      };
    },
    formatOutput: formatOutput ?? resolveFormatter({ formatter, rootDir: resolvedRoot }),
    staleCommand,
  });
};

const readOptionValue = (argv, index, option) => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
};

export const parseClientEntityCodegenArguments = (argv = []) => {
  const options = {};
  const runnerArguments = [];
  const seenOptions = new Set();
  let help = false;
  const valueOptions = new Map([
    ['--graph', 'graphApiPath'],
    ['--output', 'outputPath'],
    ['--schema-import', 'schemaImportPath'],
    ['--operation-conditions-output', 'operationConditionsOutputPath'],
    ['--format', 'formatter'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const optionName = valueOptions.get(argument);

    if (argument === '--help' || argument === '-h') {
      if (help) throw new Error('--help may only be provided once.');
      help = true;
      continue;
    }

    if (argument === '--operation-conditions-only') {
      if (seenOptions.has(argument)) {
        throw new Error(`${argument} may only be provided once.`);
      }
      seenOptions.add(argument);
      options.operationConditionsOnly = true;
      continue;
    }

    if (optionName) {
      if (seenOptions.has(argument)) {
        throw new Error(`${argument} may only be provided once.`);
      }
      seenOptions.add(argument);
      options[optionName] = readOptionValue(argv, index, argument);
      index += 1;
      continue;
    }

    runnerArguments.push(argument);
  }

  if (options.formatter && options.formatter !== 'oxfmt') {
    throw new Error(`Unknown Ontahi client codegen formatter: ${options.formatter}`);
  }

  return { help, options, runnerArguments };
};

export const runClientEntityCodegenCli = async ({
  argv = process.argv.slice(2),
  logger = console,
} = {}) => {
  const { help, options, runnerArguments } = parseClientEntityCodegenArguments(argv);
  if (help) {
    logger.log(clientEntityCodegenHelp);
    return;
  }
  const runner = createClientEntityCodegenRunner(options);
  await runner.runCli({ argv: runnerArguments });
};
