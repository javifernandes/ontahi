import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  assert,
  lockstepVersion,
  prereleaseVersionPattern,
  publicPackages,
} from './public-packages.mjs';

const parseVersion = version => {
  const match = prereleaseVersionPattern.exec(version);
  assert(match, `Version ${version} must be an immutable alpha or next prerelease.`);
  return {
    core: match.slice(1, 4).map(Number),
    channel: match[4],
    sequence: Number(match[5]),
  };
};

const compareVersions = (left, right) => {
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }

  if (left.channel !== right.channel) return left.channel.localeCompare(right.channel);
  return left.sequence - right.sequence;
};

const arguments_ = process.argv.slice(2);
assert(
  arguments_.length === 1,
  'Usage: pnpm release:version <major.minor.patch-alpha|next.sequence>',
);

const nextVersion = arguments_[0];
const currentVersion = lockstepVersion();
const current = parseVersion(currentVersion);
const next = parseVersion(nextVersion);

assert(
  compareVersions(current, next) < 0,
  `The next version ${nextVersion} must be greater than ${currentVersion}.`,
);

const updates = publicPackages.map(entry => ({
  filePath: path.join(entry.directory, 'package.json'),
  manifest: { ...entry.manifest, version: nextVersion },
}));

updates.forEach(({ filePath, manifest }) => {
  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
});

process.stdout.write(
  `Updated ${updates.length} public Ontahi packages from ${currentVersion} to ${nextVersion}.\n`,
);
process.stdout.write(
  'Commit the package manifests before dispatching the npm prerelease workflow.\n',
);
