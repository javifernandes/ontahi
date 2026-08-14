import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
const usage =
  'Usage: node scripts/todo-example.mjs <local|registry> [--auth <disabled|github>] [--version <version>]';

const parseArguments = rawArguments => {
  const args = rawArguments.filter(argument => argument !== '--');
  const mode = args.shift();
  assert(mode === 'local' || mode === 'registry', usage);

  let authenticationMode = process.env.TODO_AUTH_MODE ?? 'disabled';
  assert(
    authenticationMode === 'disabled' || authenticationMode === 'github',
    `Unsupported TODO_AUTH_MODE ${JSON.stringify(authenticationMode)}. ${usage}`,
  );
  let authenticationOptionSeen = false;
  let version;
  while (args.length > 0) {
    const option = args.shift();
    if (option === '--auth') {
      assert(!authenticationOptionSeen, '--auth may only be provided once.');
      const value = args.shift();
      assert(value && !value.startsWith('--'), '--auth requires a value.');
      assert(value === 'disabled' || value === 'github', '--auth must be disabled or github.');
      authenticationMode = value;
      authenticationOptionSeen = true;
    } else if (option === '--version') {
      assert(mode === 'registry', '--version is only valid in registry mode.');
      assert(version === undefined, '--version may only be provided once.');

      const value = args.shift();
      assert(value && !value.startsWith('--'), '--version requires a value.');
      version = value;
    } else {
      assert(false, `Unknown argument ${JSON.stringify(option)}. ${usage}`);
    }
  }

  return { authenticationMode, mode, version };
};

const cli = parseArguments(process.argv.slice(2));
const exampleEnvironment = { TODO_AUTH_MODE: cli.authenticationMode };

if (cli.authenticationMode === 'github') {
  ['TODO_GITHUB_CLIENT_ID', 'TODO_GITHUB_CLIENT_SECRET', 'TODO_SESSION_SECRET'].forEach(name =>
    assert(process.env[name], `${name} is required with --auth github.`),
  );
}

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
  run(
    'pnpm',
    ['--recursive', '--filter', `${todoPackageName}^...`, '--if-present', 'run', 'build'],
    { env: exampleEnvironment },
  );
  run('pnpm', ['--filter', todoPackageName, 'run', 'codegen'], { env: exampleEnvironment });
  run('pnpm', ['--filter', todoPackageName, 'run', 'build:client'], {
    env: exampleEnvironment,
  });
};

const runLocalExample = async () => {
  prepareLocalExample();
  process.stdout.write(
    `\nTodo uses local Ontahi workspace packages with ${cli.authenticationMode} authentication at http://localhost:3001\n\n`,
  );
  await waitForProcesses([
    start(
      'pnpm',
      [
        '--parallel',
        '--recursive',
        '--filter',
        `${todoPackageName}^...`,
        '--if-present',
        'run',
        'build:watch',
      ],
      { env: exampleEnvironment },
    ),
    start('pnpm', ['--filter', todoPackageName, 'run', 'dev'], {
      env: exampleEnvironment,
    }),
  ]);
};

const copyRegistryExample = version => {
  assert(
    /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(version),
    `Invalid registry version ${JSON.stringify(version)}.`,
  );
  const versionDirectory = path.join(registryArtifactsRoot, version);
  assert(
    versionDirectory.startsWith(`${registryArtifactsRoot}${path.sep}`),
    'Registry artifact target escaped its expected root.',
  );

  mkdirSync(versionDirectory, { recursive: true });
  const targetDirectory = mkdtempSync(path.join(versionDirectory, 'run-'));
  assert(
    targetDirectory.startsWith(`${versionDirectory}${path.sep}`),
    'Registry run target escaped its expected version directory.',
  );
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

const runRegistryExample = async requestedVersion => {
  const version = requestedVersion ?? process.env.ONTAHI_VERSION ?? lockstepVersion();
  const { manifest, targetDirectory } = copyRegistryExample(version);
  try {
    run(
      'pnpm',
      ['--ignore-workspace', 'install', '--no-frozen-lockfile', '--strict-peer-dependencies'],
      { cwd: targetDirectory, env: exampleEnvironment },
    );
    verifyRegistryResolution({ manifest, targetDirectory, version });
    run('pnpm', ['--ignore-workspace', 'run', 'codegen'], {
      cwd: targetDirectory,
      env: exampleEnvironment,
    });
    run('pnpm', ['--ignore-workspace', 'run', 'build:client'], {
      cwd: targetDirectory,
      env: exampleEnvironment,
    });

    process.stdout.write(
      `\nTodo uses exact published Ontahi ${version} packages with ${cli.authenticationMode} authentication at http://localhost:3001\n` +
        `Isolated application: ${targetDirectory}\n\n`,
    );
    await waitForProcesses([
      start('pnpm', ['--ignore-workspace', 'run', 'dev'], {
        cwd: targetDirectory,
        env: exampleEnvironment,
      }),
    ]);
  } finally {
    assert(
      targetDirectory.startsWith(`${registryArtifactsRoot}${path.sep}`),
      'Registry cleanup target escaped its expected root.',
    );
    rmSync(targetDirectory, { force: true, recursive: true });
  }
};

if (cli.mode === 'local') await runLocalExample();
else await runRegistryExample(cli.version);
