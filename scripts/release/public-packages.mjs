import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const repositoryRoot = path.resolve(import.meta.dirname, '../..');
export const packagesRoot = path.join(repositoryRoot, 'packages');
export const expectedPublicPackageCount = 10;
export const prereleaseVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-(alpha|next)\.(0|[1-9]\d*)$/;

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));

export const publicPackages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter(
    entry => entry.isDirectory() && existsSync(path.join(packagesRoot, entry.name, 'package.json')),
  )
  .map(entry => {
    const directory = path.join(packagesRoot, entry.name);
    return { directory, manifest: readJson(path.join(directory, 'package.json')) };
  })
  .filter(entry => entry.manifest.private !== true)
  .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));

const packageNames = new Set(publicPackages.map(entry => entry.manifest.name));

export const internalDependencies = manifest =>
  Object.entries({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }).filter(([name]) => packageNames.has(name));

export const lockstepVersion = () => {
  assert(
    publicPackages.length === expectedPublicPackageCount,
    `Expected ${expectedPublicPackageCount} public Ontahi packages, found ${publicPackages.length}.`,
  );

  const versions = new Set(publicPackages.map(entry => entry.manifest.version));
  assert(versions.size === 1, 'Every public Ontahi package must use the same lockstep version.');
  return [...versions][0];
};

export const prereleaseChannel = version => {
  const match = prereleaseVersionPattern.exec(version);
  assert(match, `Version ${version} must be an immutable alpha or next prerelease.`);
  return match[4];
};

export const releaseOrder = () => {
  const remaining = new Map(
    publicPackages.map(entry => [
      entry.manifest.name,
      new Set(internalDependencies(entry.manifest).map(([name]) => name)),
    ]),
  );
  const ordered = [];

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => [...dependencies].every(name => ordered.includes(name)))
      .map(([name]) => name)
      .sort();

    assert(ready.length > 0, 'Ontahi package dependencies contain a cycle.');
    ready.forEach(name => {
      ordered.push(name);
      remaining.delete(name);
    });
  }

  return ordered;
};

export const packageByName = name => {
  const entry = publicPackages.find(candidate => candidate.manifest.name === name);
  assert(entry, `Unknown public Ontahi package: ${name}.`);
  return entry;
};
