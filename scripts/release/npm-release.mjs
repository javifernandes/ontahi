import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  assert,
  internalDependencies,
  lockstepVersion,
  packageByName,
  prereleaseChannel,
  publicPackages,
  readJson,
  releaseOrder,
  repositoryRoot,
} from './public-packages.mjs';

const registry = 'https://registry.npmjs.org';
const npmEnvironment = {
  ...process.env,
  npm_config_cache: path.join(repositoryRoot, '.artifacts/npm-cache'),
};
const run = (command, args, options = {}) => {
  process.stdout.write(`> ${command} ${args.join(' ')}\n`);
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: options.encoding,
    env: command === 'npm' ? npmEnvironment : process.env,
    stdio: options.encoding ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
};

const parseArguments = arguments_ => {
  const options = {};

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--') continue;
    assert(argument.startsWith('--'), `Unexpected argument: ${argument}.`);
    const key = argument.slice(2);
    const value = arguments_[index + 1];
    assert(value && !value.startsWith('--'), `Missing value for --${key}.`);
    options[key] = value;
    index += 1;
  }

  return options;
};

const validateCandidate = ({ version, tag }) => {
  const channel = prereleaseChannel(version);
  assert(tag === channel, `Dist-tag ${tag} must match the ${channel} prerelease channel.`);
  const sourceVersion = lockstepVersion();
  assert(
    version === sourceVersion,
    `Release input ${version} does not match the package lockstep version ${sourceVersion}.`,
  );
};

const sha512 = filePath =>
  `sha512-${createHash('sha512').update(readFileSync(filePath)).digest('base64')}`;

const prepare = options => {
  const version = options.version ?? lockstepVersion();
  const tag = options.tag;
  const outputDirectory = path.resolve(options.output ?? `.artifacts/npm/${version}`);
  validateCandidate({ version, tag });
  mkdirSync(outputDirectory, { recursive: true });

  const packages = releaseOrder().map(name => {
    const entry = packageByName(name);
    const packed = JSON.parse(
      run('pnpm', ['pack', '--pack-destination', outputDirectory, '--json'], {
        cwd: entry.directory,
        encoding: 'utf8',
      }),
    );
    const tarball = path.resolve(packed.filename);
    const packedManifest = JSON.parse(
      run('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
    );

    assert(packedManifest.name === name, `${name} produced a tarball for ${packedManifest.name}.`);
    assert(
      packedManifest.version === version,
      `${name} tarball uses ${packedManifest.version}, expected ${version}.`,
    );
    internalDependencies(entry.manifest).forEach(([dependencyName]) =>
      assert(
        packedManifest.dependencies?.[dependencyName] === version ||
          packedManifest.peerDependencies?.[dependencyName] === version,
        `${name} did not pack ${dependencyName} at ${version}.`,
      ),
    );

    return {
      name,
      version,
      filename: path.basename(tarball),
      integrity: sha512(tarball),
    };
  });

  const sourceCommit =
    process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const releaseManifest = {
    schemaVersion: 1,
    version,
    tag,
    sourceCommit,
    packages,
  };
  const releaseManifestPath = path.join(outputDirectory, 'release-manifest.json');
  writeFileSync(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
  process.stdout.write(`Prepared ${packages.length} packages in ${outputDirectory}.\n`);
  process.stdout.write(`Release manifest: ${releaseManifestPath}\n`);
};

const loadManifest = manifestPath => {
  const absoluteManifestPath = path.resolve(manifestPath);
  assert(existsSync(absoluteManifestPath), `Release manifest not found: ${absoluteManifestPath}.`);
  const manifest = readJson(absoluteManifestPath);
  validateCandidate(manifest);
  assert(manifest.schemaVersion === 1, 'Unsupported release manifest schema.');
  if (process.env.GITHUB_SHA) {
    assert(
      manifest.sourceCommit === process.env.GITHUB_SHA,
      'Release manifest does not belong to the checked-out GitHub commit.',
    );
  }
  assert(
    manifest.packages.length === publicPackages.length,
    'Release manifest does not contain the complete lockstep package set.',
  );
  assert(
    manifest.packages.map(entry => entry.name).join('\n') === releaseOrder().join('\n'),
    'Release manifest package order does not match the dependency order.',
  );

  const directory = path.dirname(absoluteManifestPath);
  manifest.packages.forEach(entry => {
    assert(entry.version === manifest.version, `${entry.name} does not use the release version.`);
    assert(
      path.basename(entry.filename) === entry.filename && entry.filename.endsWith('.tgz'),
      `${entry.name} has an invalid tarball filename.`,
    );
    const tarball = path.join(directory, entry.filename);
    assert(existsSync(tarball), `Missing tarball for ${entry.name}: ${tarball}.`);
    assert(sha512(tarball) === entry.integrity, `${entry.name} tarball integrity changed.`);
  });

  return { directory, manifest };
};

const registryIntegrity = packageSpec => {
  const result = spawnSync(
    'npm',
    ['view', packageSpec, 'dist.integrity', '--json', '--registry', registry],
    { cwd: repositoryRoot, encoding: 'utf8', env: npmEnvironment },
  );

  if (result.status === 0) return JSON.parse(result.stdout);
  if (/E404|404 Not Found|is not in this registry/.test(`${result.stderr}\n${result.stdout}`)) {
    return undefined;
  }
  throw new Error(`Could not inspect ${packageSpec} on npm:\n${result.stderr || result.stdout}`);
};

const publish = (options, dryRun) => {
  assert(options.manifest, 'Missing required --manifest.');
  const { directory, manifest } = loadManifest(options.manifest);

  if (dryRun) {
    manifest.packages.forEach(entry => {
      const result = JSON.parse(
        run(
          'npm',
          [
            'publish',
            path.join(directory, entry.filename),
            '--dry-run',
            '--offline',
            '--json',
            '--loglevel',
            'error',
            '--access',
            'public',
            '--tag',
            manifest.tag,
            '--registry',
            registry,
          ],
          { encoding: 'utf8' },
        ),
      );
      const packageResult = result[entry.name];
      assert(
        packageResult?.id === `${entry.name}@${entry.version}`,
        `${entry.name} dry-run failed.`,
      );
      assert(
        packageResult.integrity === entry.integrity,
        `${entry.name} dry-run produced different contents.`,
      );
    });
    process.stdout.write(
      `Dry-run passed for ${manifest.packages.length} packages at ${manifest.version}.\n`,
    );
    return;
  }

  const remoteState = manifest.packages.map(entry => {
    const remoteIntegrity = registryIntegrity(`${entry.name}@${entry.version}`);
    assert(
      remoteIntegrity === undefined || remoteIntegrity === entry.integrity,
      `${entry.name}@${entry.version} already exists with different contents. Versions are immutable.`,
    );
    return { ...entry, published: remoteIntegrity === entry.integrity };
  });

  remoteState.forEach(entry => {
    if (entry.published) {
      process.stdout.write(`Skipping identical existing ${entry.name}@${entry.version}.\n`);
      return;
    }

    run('npm', [
      'publish',
      path.join(directory, entry.filename),
      '--access',
      'public',
      '--tag',
      manifest.tag,
      '--provenance',
      '--registry',
      registry,
    ]);
  });

  process.stdout.write(`Published Ontahi ${manifest.version} on the ${manifest.tag} channel.\n`);
};

const [command, ...rawArguments] = process.argv.slice(2);
const options = parseArguments(rawArguments);

if (command === 'prepare') prepare(options);
else if (command === 'dry-run') publish(options, true);
else if (command === 'publish') publish(options, false);
else throw new Error('Expected one of: prepare, dry-run, publish.');
