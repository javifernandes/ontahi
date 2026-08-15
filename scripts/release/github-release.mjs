import { assert, lockstepVersion, prereleaseChannel } from './public-packages.mjs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const version = process.env.RELEASE_VERSION;
const commit = process.env.RELEASE_COMMIT;
const pullRequestNumber = process.env.RELEASE_PULL_REQUEST;

assert(token, 'Missing GITHUB_TOKEN.');
assert(repository, 'Missing GITHUB_REPOSITORY.');
assert(version, 'Missing RELEASE_VERSION.');
assert(commit, 'Missing RELEASE_COMMIT.');
assert(version === lockstepVersion(), 'Release metadata version does not match the source.');
prereleaseChannel(version);

const request = async (path, options = {}, expected = [200]) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  assert(
    expected.includes(response.status),
    `GitHub ${options.method ?? 'GET'} ${path} failed: ${response.status}.`,
  );
  return response.status === 204 ? undefined : response.json();
};

const tag = `v${version}`;
const tagReferenceResponse = await fetch(
  `https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
  {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
);
if (tagReferenceResponse.status === 200) {
  const tagReference = await tagReferenceResponse.json();
  assert(tagReference.object.sha === commit, `${tag} points to a different source commit.`);
} else {
  assert(tagReferenceResponse.status === 404, `Could not inspect Git tag ${tag}.`);
}

const existingReleaseResponse = await fetch(
  `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
  {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  },
);

if (existingReleaseResponse.status === 200) {
  const existingRelease = await existingReleaseResponse.json();
  assert(existingRelease.prerelease === true, `${tag} exists but is not a prerelease.`);
  process.stdout.write(`GitHub prerelease ${tag} already exists.\n`);
  process.exit(0);
}
assert(existingReleaseResponse.status === 404, `Could not inspect GitHub release ${tag}.`);

const releasePullRequest = pullRequestNumber
  ? await request(`/pulls/${pullRequestNumber}`)
  : (await request(`/commits/${commit}/pulls`)).find(
      pullRequest => pullRequest.merged_at && pullRequest.base.ref === 'main',
    );
assert(releasePullRequest, `Could not find the merged release pull request for ${commit}.`);
const notesMarker = '# Releases';
const notesIndex = (releasePullRequest.body ?? '').indexOf(notesMarker);
assert(notesIndex >= 0, 'The merged release pull request has no generated release notes.');
const body = releasePullRequest.body.slice(notesIndex).trim();

await request(
  '/releases',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: commit,
      name: `Ontahi ${version}`,
      body,
      prerelease: true,
      draft: false,
      generate_release_notes: false,
    }),
  },
  [201],
);
process.stdout.write(`Created GitHub prerelease ${tag}.\n`);
