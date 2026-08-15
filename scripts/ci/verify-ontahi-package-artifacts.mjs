import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assert,
  expectedPublicPackageCount,
  internalDependencies,
  lockstepVersion,
  packageByName,
  prereleaseChannel,
  publicPackages as packages,
  releaseOrder,
  repositoryRoot,
} from '../release/public-packages.mjs';

const fixtureRoot = path.join(repositoryRoot, 'fixtures/package-consumer');
const expectedVersion = lockstepVersion();
const expectedRepositoryUrl = 'git+https://github.com/javifernandes/ontahi.git';
const expectedLicense = readFileSync(path.join(repositoryRoot, 'LICENSE'), 'utf8');
const expectedNotice = readFileSync(path.join(repositoryRoot, 'NOTICE'), 'utf8');
const skipBuild = process.argv.includes('--skip-build');
const keepArtifacts =
  process.argv.includes('--keep') || process.env.ONTAHI_ARTIFACT_KEEP === 'true';
const artifactsPathFile = process.env.ONTAHI_ARTIFACT_PATH_FILE;

const supportDependencies = {
  '@opentelemetry/api': '^1.9.1',
  '@tanstack/react-query': '^5.51.0',
  '@types/express': '^4.17.21',
  '@types/node': '^20.0.0',
  '@types/react': '^18.3.0',
  '@types/react-dom': '^18.3.0',
  express: '^4.22.2',
  'lucide-react': '^0.576.0',
  next: '^14.2.0',
  react: '^18.3.0',
  'react-dom': '^18.3.0',
  typescript: '^5.4.0',
};

const run = (command, args, options = {}) => {
  process.stdout.write(`> ${command} ${args.join(' ')}\n`);
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: options.encoding,
    env: { ...process.env, ...options.env },
    stdio: options.encoding ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    ...options,
  });
};

const validateSourceManifests = () => {
  assert(
    packages.length === expectedPublicPackageCount,
    `Expected ${expectedPublicPackageCount} public Ontahi packages, found ${packages.length}.`,
  );
  prereleaseChannel(expectedVersion);

  packages.forEach(({ directory, manifest }) => {
    const packageDirectory = `packages/${path.basename(directory)}`;
    assert(manifest.version === expectedVersion, `${manifest.name} must use ${expectedVersion}.`);
    assert(manifest.license === 'Apache-2.0', `${manifest.name} must declare Apache-2.0.`);
    assert(manifest.engines?.node === '>=20.19.0', `${manifest.name} must declare Node >=20.19.0.`);
    assert(manifest.publishConfig?.access === 'public', `${manifest.name} must publish publicly.`);
    assert(manifest.publishConfig?.provenance === true, `${manifest.name} must enable provenance.`);
    assert(
      manifest.repository?.url === expectedRepositoryUrl,
      `${manifest.name} repository.url must identify the public Ontahi repository.`,
    );
    assert(
      manifest.repository?.directory === packageDirectory,
      `${manifest.name} repository.directory must identify its package source.`,
    );
    assert(
      manifest.homepage === `https://github.com/javifernandes/ontahi/tree/main/${packageDirectory}`,
      `${manifest.name} homepage must identify its public package source.`,
    );
    assert(
      existsSync(path.join(directory, 'README.md')),
      `${manifest.name} must include a README.`,
    );
    assert(
      readFileSync(path.join(directory, 'LICENSE'), 'utf8') === expectedLicense,
      `${manifest.name} must carry the Ontahi Apache-2.0 license.`,
    );
    assert(
      readFileSync(path.join(directory, 'NOTICE'), 'utf8') === expectedNotice,
      `${manifest.name} must carry the Ontahi notice.`,
    );
    assert(manifest.exports?.['.'], `${manifest.name} must declare its package-root export.`);

    internalDependencies(manifest).forEach(([name, version]) =>
      assert(
        version === 'workspace:*',
        `${manifest.name} must source ${name} through workspace:*.`,
      ),
    );

    if (manifest.name === '@ontahi/codegen') {
      assert(
        ['src', 'types', 'LICENSE', 'NOTICE'].every(file => manifest.files.includes(file)),
        '@ontahi/codegen must publish executable sources, declarations, and legal files.',
      );
      assert(
        manifest.bin?.['ontahi-codegen'] === './src/cli.mjs',
        '@ontahi/codegen must publish the conventional ontahi-codegen executable.',
      );
    } else {
      assert(
        ['dist', 'LICENSE', 'NOTICE'].every(file => manifest.files.includes(file)),
        `${manifest.name} must publish dist and its legal files.`,
      );
    }
  });

  const expressManifest = packages.find(
    entry => entry.manifest.name === '@ontahi/runtime-express',
  )?.manifest;
  assert(
    expressManifest?.dependencies?.['@ontahi/explorer-react'] === undefined,
    '@ontahi/runtime-express must not install Explorer React as a base dependency.',
  );
  assert(
    expressManifest?.peerDependenciesMeta?.['@ontahi/explorer-react']?.optional === true,
    'The Express Explorer integration must be an optional peer.',
  );
};

const packPackages = artifactsDirectory =>
  Object.fromEntries(
    releaseOrder().map(name => {
      const entry = packageByName(name);
      const packed = JSON.parse(
        run('pnpm', ['pack', '--pack-destination', artifactsDirectory, '--json'], {
          cwd: entry.directory,
          encoding: 'utf8',
        }),
      );
      const filePaths = new Set(packed.files.map(file => file.path));

      assert(filePaths.has('LICENSE'), `${name} artifact is missing LICENSE.`);
      assert(filePaths.has('NOTICE'), `${name} artifact is missing NOTICE.`);

      Object.values(entry.manifest.exports).forEach(exportDefinition => {
        if (typeof exportDefinition === 'string') {
          assert(
            filePaths.has(exportDefinition.replace(/^\.\//, '')),
            `${name} is missing ${exportDefinition}.`,
          );
          return;
        }

        Object.values(exportDefinition).forEach(target =>
          assert(filePaths.has(target.replace(/^\.\//, '')), `${name} is missing ${target}.`),
        );
      });

      if (name !== '@ontahi/codegen') {
        assert(
          [...filePaths].every(filePath => !filePath.startsWith('src/')),
          `${name} leaked workspace source into its artifact.`,
        );
      }

      if (name === '@ontahi/codegen') {
        assert(filePaths.has('src/cli.mjs'), '@ontahi/codegen artifact is missing its executable.');
      }

      const packedManifest = JSON.parse(
        run('tar', ['-xOf', packed.filename, 'package/package.json'], { encoding: 'utf8' }),
      );
      const packedLicense = run('tar', ['-xOf', packed.filename, 'package/LICENSE'], {
        encoding: 'utf8',
      });
      const packedNotice = run('tar', ['-xOf', packed.filename, 'package/NOTICE'], {
        encoding: 'utf8',
      });
      assert(packedLicense === expectedLicense, `${name} artifact carries the wrong LICENSE.`);
      assert(packedNotice === expectedNotice, `${name} artifact carries the wrong NOTICE.`);
      assert(
        packedManifest.repository?.url === expectedRepositoryUrl,
        `${name} artifact points to the wrong source repository.`,
      );
      internalDependencies(entry.manifest).forEach(([dependencyName]) =>
        assert(
          packedManifest.dependencies?.[dependencyName] === expectedVersion ||
            packedManifest.peerDependencies?.[dependencyName] === expectedVersion,
          `${name} did not rewrite ${dependencyName} to ${expectedVersion}.`,
        ),
      );

      return [name, packed.filename];
    }),
  );

const relativeTarball = (consumerDirectory, tarball) =>
  `file:${path.relative(consumerDirectory, tarball).split(path.sep).join('/')}`;

const installConsumer = ({ root, name, tarballs, dependencies, copyFixture = false }) => {
  const consumerDirectory = path.join(root, name);
  if (copyFixture) cpSync(fixtureRoot, consumerDirectory, { recursive: true });

  const packageTarballs = Object.fromEntries(
    Object.entries(tarballs).map(([packageName, tarball]) => [
      packageName,
      relativeTarball(consumerDirectory, tarball),
    ]),
  );
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: `@ontahi/artifact-${name}`,
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.28.2',
        dependencies: { ...packageTarballs, ...dependencies },
        pnpm: { overrides: packageTarballs },
      },
      null,
      2,
    )}\n`,
  );
  run(
    'pnpm',
    ['--ignore-workspace', 'install', '--no-frozen-lockfile', '--strict-peer-dependencies'],
    { cwd: consumerDirectory },
  );

  const lockfile = readFileSync(path.join(consumerDirectory, 'pnpm-lock.yaml'), 'utf8');
  assert(!lockfile.includes('workspace:'), `${name} consumer resolved a workspace dependency.`);
  assert(!lockfile.includes(repositoryRoot), `${name} consumer resolved repository source.`);
  Object.keys(tarballs).forEach(packageName =>
    assert(
      existsSync(path.join(consumerDirectory, 'node_modules', packageName, 'package.json')),
      `${name} consumer did not install ${packageName}.`,
    ),
  );

  return consumerDirectory;
};

const verifyArtifacts = () => {
  validateSourceManifests();
  process.stdout.write(`Ontahi release order: ${releaseOrder().join(' -> ')}\n`);

  if (!skipBuild) {
    run('pnpm', ['--recursive', '--filter', './packages/**', 'run', 'build']);
  }

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'ontahi-package-artifacts-'));
  const artifactsDirectory = path.join(temporaryRoot, 'artifacts');
  if (artifactsPathFile) writeFileSync(artifactsPathFile, `${temporaryRoot}\n`);

  try {
    mkdirSync(artifactsDirectory);
    const tarballs = packPackages(artifactsDirectory);
    const minimalTarballs = Object.fromEntries(
      ['@ontahi/core', '@ontahi/runtime-express'].map(name => [name, tarballs[name]]),
    );
    const minimalConsumer = installConsumer({
      root: temporaryRoot,
      name: 'minimal-express',
      tarballs: minimalTarballs,
      dependencies: {
        '@types/express': supportDependencies['@types/express'],
        '@types/node': supportDependencies['@types/node'],
        express: supportDependencies.express,
      },
      copyFixture: true,
    });
    assert(
      !existsSync(path.join(minimalConsumer, 'node_modules/@ontahi/explorer-react')),
      'Minimal Express consumer installed Explorer React.',
    );
    run('node', ['src/runtime.mjs'], { cwd: minimalConsumer });

    const completeConsumer = installConsumer({
      root: temporaryRoot,
      name: 'all-packages',
      tarballs,
      dependencies: supportDependencies,
      copyFixture: true,
    });
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: completeConsumer });

    process.stdout.write(
      'Ontahi package artifacts passed clean-room install, type, and runtime checks.\n',
    );
    if (keepArtifacts) process.stdout.write(`Artifacts kept at ${temporaryRoot}\n`);
  } finally {
    if (!keepArtifacts) rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

verifyArtifacts();
