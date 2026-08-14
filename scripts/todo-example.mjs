import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { assert, lockstepVersion, repositoryRoot } from './release/public-packages.mjs';

const todoPackageName = '@ontahi/example-todo-express';
const todoSourceDirectory = path.join(repositoryRoot, 'examples/todo-express');
const registryArtifactsRoot = path.join(repositoryRoot, '.artifacts/todo-registry');
const ignoredCopyEntries = new Set(['coverage', 'dist', 'node_modules']);

const args = process.argv.slice(2).filter(argument => argument !== '--');
const mode = args.shift();

const optionValue = option => {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  assert(value && !value.startsWith('--'), `${option} requires a value.`);
  return value;
};

const printCommand = (command, commandArgs, cwd) => {
  const relativeCwd = path.relative(repositoryRoot, cwd) || '.';
  process.stdout.write(`[${relativeCwd}] > ${command} ${commandArgs.join(' ')}\n`);
};

const run = (command, commandArgs, options = {}) => {
  const cwd = options.cwd ?? repositoryRoot;
  printCommand(command, commandArgs, cwd);
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `${command} exited with status ${result.status}.`);
};

const start = (command, commandArgs, options = {}) => {
  const cwd = options.cwd ?? repositoryRoot;
  printCommand(command, commandArgs, cwd);
  return spawn(command, commandArgs, {
    cwd,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
};

const waitForProcesses = async processes => {
  let stopRequested = false;
  let terminating = false;
  const terminate = signal => {
    if (terminating) return;
    terminating = true;
    processes.forEach(child => {
      if (!child.killed) child.kill(signal);
    });
  };
  const requestStop = signal => {
    stopRequested = true;
    terminate(signal);
  };
  const handleInterrupt = () => requestStop('SIGINT');
  const handleTermination = () => requestStop('SIGTERM');

  process.once('SIGINT', handleInterrupt);
  process.once('SIGTERM', handleTermination);

  const outcome = await Promise.race(
    processes.map(
      child =>
        new Promise(resolve => {
          child.once('error', error => resolve({ error }));
          child.once('exit', (code, signal) => resolve({ code, signal }));
        }),
    ),
  );
  terminate('SIGTERM');
  await Promise.allSettled(
    processes.map(
      child =>
        new Promise(resolve => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once('exit', resolve);
        }),
    ),
  );
  process.removeListener('SIGINT', handleInterrupt);
  process.removeListener('SIGTERM', handleTermination);

  if (!stopRequested && outcome.error) throw outcome.error;
  if (!stopRequested && outcome.code !== 0) {
    throw new Error(`Todo development process exited with status ${outcome.code}.`);
  }
};

const prepareLocalExample = () => {
  run('pnpm', [
    '--recursive',
    '--filter',
    `${todoPackageName}^...`,
    '--if-present',
    'run',
    'build',
  ]);
  run('pnpm', ['--filter', todoPackageName, 'run', 'codegen']);
  run('pnpm', ['--filter', todoPackageName, 'run', 'build:client']);
};

const runLocalExample = async () => {
  prepareLocalExample();
  process.stdout.write('\nTodo uses local Ontahi workspace packages at http://localhost:3001\n\n');
  await waitForProcesses([
    start('pnpm', [
      '--parallel',
      '--recursive',
      '--filter',
      `${todoPackageName}^...`,
      '--if-present',
      'run',
      'build:watch',
    ]),
    start('pnpm', ['--filter', todoPackageName, 'run', 'dev']),
  ]);
};

const copyRegistryExample = version => {
  assert(
    /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version),
    `Invalid registry version ${JSON.stringify(version)}.`,
  );
  const targetDirectory = path.join(registryArtifactsRoot, version);
  assert(
    targetDirectory.startsWith(`${registryArtifactsRoot}${path.sep}`),
    'Registry artifact target escaped its expected root.',
  );

  rmSync(targetDirectory, { force: true, recursive: true });
  mkdirSync(registryArtifactsRoot, { recursive: true });
  cpSync(todoSourceDirectory, targetDirectory, {
    recursive: true,
    filter: source =>
      source === todoSourceDirectory || !ignoredCopyEntries.has(path.basename(source)),
  });

  const manifestPath = path.join(targetDirectory, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const rootManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const replaceOntahiVersions = dependencies =>
    Object.fromEntries(
      Object.entries(dependencies ?? {}).map(([name, dependencyVersion]) => [
        name,
        name.startsWith('@ontahi/') ? version : dependencyVersion,
      ]),
    );

  manifest.dependencies = replaceOntahiVersions(manifest.dependencies);
  manifest.devDependencies = replaceOntahiVersions(manifest.devDependencies);
  manifest.packageManager = rootManifest.packageManager;
  manifest.pnpm = rootManifest.pnpm;
  delete manifest.scripts.prestart;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, targetDirectory };
};

const verifyRegistryResolution = ({ manifest, targetDirectory, version }) => {
  const lockfile = readFileSync(path.join(targetDirectory, 'pnpm-lock.yaml'), 'utf8');
  assert(
    !lockfile.includes('workspace:'),
    'Registry Todo lockfile contains a workspace dependency.',
  );
  assert(!lockfile.includes('link:'), 'Registry Todo lockfile contains a linked dependency.');

  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  Object.keys(dependencies)
    .filter(name => name.startsWith('@ontahi/'))
    .forEach(name => {
      const packagePath = path.join(targetDirectory, 'node_modules', name, 'package.json');
      assert(existsSync(packagePath), `Registry Todo did not install ${name}.`);
      const installedManifest = JSON.parse(readFileSync(packagePath, 'utf8'));
      const installedPath = realpathSync(path.dirname(packagePath));
      assert(
        installedManifest.version === version,
        `${name} resolved ${installedManifest.version}.`,
      );
      assert(
        installedPath.includes(`${path.sep}node_modules${path.sep}.pnpm${path.sep}`),
        `${name} did not resolve from pnpm's registry store: ${installedPath}`,
      );
    });
};

const runRegistryExample = async () => {
  const version = optionValue('--version') ?? process.env.ONTAHI_VERSION ?? lockstepVersion();
  const { manifest, targetDirectory } = copyRegistryExample(version);
  run(
    'pnpm',
    ['--ignore-workspace', 'install', '--no-frozen-lockfile', '--strict-peer-dependencies'],
    { cwd: targetDirectory },
  );
  verifyRegistryResolution({ manifest, targetDirectory, version });
  run('pnpm', ['--ignore-workspace', 'run', 'codegen'], { cwd: targetDirectory });
  run('pnpm', ['--ignore-workspace', 'run', 'build:client'], { cwd: targetDirectory });

  process.stdout.write(
    `\nTodo uses exact published Ontahi ${version} packages at http://localhost:3001\n` +
      `Isolated application: ${targetDirectory}\n\n`,
  );
  await waitForProcesses([
    start('pnpm', ['--ignore-workspace', 'run', 'dev'], { cwd: targetDirectory }),
  ]);
};

if (mode === 'local') await runLocalExample();
else if (mode === 'registry') await runRegistryExample();
else {
  throw new Error('Usage: node scripts/todo-example.mjs <local|registry> [--version <version>]');
}
