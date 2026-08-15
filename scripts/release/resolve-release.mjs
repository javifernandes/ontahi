import { appendFileSync } from 'node:fs';

import { assert, lockstepVersion, prereleaseChannel } from './public-packages.mjs';

const outputPath = process.env.GITHUB_OUTPUT;
assert(outputPath, 'Missing GITHUB_OUTPUT.');

const eventName = process.env.GITHUB_EVENT_NAME;
const automatic = eventName === 'pull_request';
const version = lockstepVersion();
const channel = prereleaseChannel(version);
const requestedMode = process.env.REQUESTED_MODE;
const requestedVersion = process.env.REQUESTED_VERSION;
const requestedChannel = process.env.REQUESTED_CHANNEL;
const commit = process.env.RELEASE_COMMIT;
const pullRequest = process.env.RELEASE_PULL_REQUEST ?? '';

assert(commit, 'Missing RELEASE_COMMIT.');
if (!automatic) {
  assert(
    requestedMode === 'dry-run' || requestedMode === 'publish',
    'Manual releases require dry-run or publish mode.',
  );
  assert(
    requestedVersion === version,
    `Requested ${requestedVersion}; source contains ${version}.`,
  );
  assert(
    requestedChannel === channel,
    `Requested ${requestedChannel}; version requires ${channel}.`,
  );
}

const values = {
  mode: automatic ? 'publish' : requestedMode,
  version,
  channel,
  commit,
  pull_request: pullRequest,
};

appendFileSync(
  outputPath,
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
);
process.stdout.write(`Resolved Ontahi ${version} (${values.mode}, ${channel}) at ${commit}.\n`);
