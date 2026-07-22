import { spawn } from 'node:child_process';
import { watchFile } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { formatCodegenDiagnostic } from './application-analysis.mjs';

const defaultFormatDiagnostic = diagnostic =>
  typeof diagnostic === 'string'
    ? diagnostic
    : diagnostic?.message
      ? diagnostic.message
      : String(diagnostic);

const selectTargets = (targets, onlyTargetName) => {
  const selectedTargets = onlyTargetName
    ? targets.filter(target => target.name === onlyTargetName)
    : targets;

  if (selectedTargets.length === 0) {
    throw new Error(
      onlyTargetName
        ? `Unknown Ontahi generation target: ${onlyTargetName}`
        : 'No Ontahi generation targets configured.',
    );
  }

  return selectedTargets;
};

const readExistingOutput = async outputPath => {
  try {
    return await readFile(outputPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const withTrailingNewline = source => (source.endsWith('\n') ? source : `${source}\n`);

export const parseCodegenRunnerArguments = (argv = []) => {
  const options = {
    check: false,
    onlyTargetName: undefined,
    watch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--check') {
      options.check = true;
      continue;
    }

    if (argument === '--watch') {
      options.watch = true;
      continue;
    }

    if (argument === '--only') {
      const targetName = argv[index + 1];
      if (!targetName || targetName.startsWith('--')) {
        throw new Error('--only requires a target name.');
      }

      options.onlyTargetName = targetName;
      index += 1;
      continue;
    }

    throw new Error(`Unknown Ontahi codegen argument: ${argument}`);
  }

  if (options.check && options.watch) {
    throw new Error('Cannot use --check and --watch together.');
  }

  return options;
};

export const createStdinCommandFormatter = ({ command, args, cwd, label = command }) => {
  if (!command || !args) {
    throw new Error('createStdinCommandFormatter requires command and args.');
  }

  return async ({ outputPath, source }) =>
    new Promise((resolve, reject) => {
      const resolvedArgs = typeof args === 'function' ? args({ outputPath }) : args;
      const child = spawn(command, resolvedArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const resolveOnce = value => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      const rejectOnce = error => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
      child.stderr.on('data', chunk => {
        stderr += chunk;
      });
      child.on('error', error => {
        rejectOnce(new Error(`${label} failed to start for ${outputPath}: ${error.message}`));
      });
      child.on('close', code => {
        if (code === 0) {
          resolveOnce(stdout);
          return;
        }

        rejectOnce(new Error(`${label} failed for ${outputPath}:\n${stderr || stdout}`));
      });
      child.stdin.on('error', error => {
        rejectOnce(
          new Error(`${label} could not read generated source for ${outputPath}: ${error.message}`),
        );
      });
      child.stdin.end(source);
    });
};

export const createOntahiCodegenRunner = ({
  targets,
  analyzeApplication,
  renderTarget,
  formatOutput = async ({ source }) => source,
  formatAnalysisDiagnostic = formatCodegenDiagnostic,
  formatTargetDiagnostic = defaultFormatDiagnostic,
  staleCommand = 'pnpm run generate:ontahi',
  watchDebounceMs = 250,
  watchIntervalMs = 250,
  logger = console,
}) => {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('createOntahiCodegenRunner requires at least one target.');
  }
  if (typeof analyzeApplication !== 'function' || typeof renderTarget !== 'function') {
    throw new Error('createOntahiCodegenRunner requires analyzeApplication and renderTarget.');
  }

  const createAnalysisCache = () => {
    const analyses = new Map();
    return sourcePath => {
      let analysis = analyses.get(sourcePath);
      if (!analysis) {
        analysis = Promise.resolve(analyzeApplication(sourcePath));
        analyses.set(sourcePath, analysis);
      }
      return analysis;
    };
  };

  const collectWatchPaths = async (explicitTargets = targets) => {
    const watchPaths = new Set();
    const getApplicationAnalysis = createAnalysisCache();

    for (const target of explicitTargets) {
      watchPaths.add(target.sourcePath);
      const application = await getApplicationAnalysis(target.sourcePath);
      for (const sourcePath of application.sourcePaths ?? []) {
        watchPaths.add(sourcePath);
      }
    }

    return [...watchPaths].sort();
  };

  const generate = async ({ check = false, onlyTargetName, targets: explicitTargets } = {}) => {
    const selectedTargets = selectTargets(explicitTargets ?? targets, onlyTargetName);
    const getApplicationAnalysis = createAnalysisCache();
    const driftedOutputs = [];

    for (const target of selectedTargets) {
      const application = await getApplicationAnalysis(target.sourcePath);
      const analysisDiagnostics = (application.diagnostics ?? []).map(formatAnalysisDiagnostic);

      if (analysisDiagnostics.length > 0) {
        throw new Error(`Cannot generate ${target.name}:\n- ${analysisDiagnostics.join('\n- ')}`);
      }

      const rendered = await renderTarget({ application, target });
      const targetDiagnostics = (rendered.diagnostics ?? []).map(formatTargetDiagnostic);

      if (targetDiagnostics.length > 0) {
        throw new Error(`Cannot generate ${target.name}:\n- ${targetDiagnostics.join('\n- ')}`);
      }

      for (const output of rendered.outputs ?? []) {
        const source = withTrailingNewline(output.source);
        const generatedText = await formatOutput({
          application,
          outputPath: output.outputPath,
          source,
          target,
        });
        const existingText = await readExistingOutput(output.outputPath);

        if (check) {
          if (existingText !== generatedText) {
            driftedOutputs.push(output.outputPath);
          }
          continue;
        }

        if (existingText !== generatedText) {
          await mkdir(path.dirname(output.outputPath), { recursive: true });
          await writeFile(output.outputPath, generatedText, 'utf8');
        }
      }
    }

    if (check && driftedOutputs.length > 0) {
      throw new Error(
        `Generated Ontahi artifacts are stale:\n- ${driftedOutputs.join('\n- ')}\nRun ${staleCommand}.`,
      );
    }

    return { driftedOutputs };
  };

  const watch = async ({ onlyTargetName } = {}) => {
    const selectedTargets = selectTargets(targets, onlyTargetName);
    let rerunTimeout;
    let isRunning = false;
    let hasQueuedRun = false;

    const runGeneration = async () => {
      if (isRunning) {
        hasQueuedRun = true;
        return;
      }

      isRunning = true;
      try {
        await generate({ onlyTargetName });
        logger.log('[ontahi-codegen] Generated Ontahi artifacts.');
      } catch (error) {
        logger.error(
          '[ontahi-codegen] Generation failed:\n',
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        isRunning = false;
        if (hasQueuedRun) {
          hasQueuedRun = false;
          void runGeneration();
        }
      }
    };

    await runGeneration();
    const watchPaths = await collectWatchPaths(selectedTargets);

    for (const watchPath of watchPaths) {
      watchFile(watchPath, { interval: watchIntervalMs }, (current, previous) => {
        if (current.mtimeMs === previous.mtimeMs) {
          return;
        }

        if (rerunTimeout) {
          clearTimeout(rerunTimeout);
        }
        rerunTimeout = setTimeout(() => {
          void runGeneration();
        }, watchDebounceMs);
      });
    }

    logger.log(`[ontahi-codegen] Watching ${watchPaths.length} source files for changes.`);
    await new Promise(() => {});
  };

  const runCli = async ({ argv = process.argv.slice(2) } = {}) => {
    const options = parseCodegenRunnerArguments(argv);
    if (options.watch) {
      await watch({ onlyTargetName: options.onlyTargetName });
      return;
    }

    await generate({ check: options.check, onlyTargetName: options.onlyTargetName });
  };

  return {
    collectWatchPaths,
    generate,
    runCli,
    watch,
  };
};
