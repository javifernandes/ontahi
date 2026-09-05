# Releasing Ontahi

Ontahi publishes all eleven `@ontahi/*` packages at one exact lockstep prerelease version. Each feature
records its consumer-visible change; merging the generated release pull request publishes that
immutable version.

## The short version

For a contributor changing a public package:

1. Run `pnpm changeset` in the feature branch.
2. Select only the packages directly affected and describe the consumer-visible change.
3. Commit the generated `.changeset/*.md` file with the code and open the pull request.

After the feature pull request is merged, automation creates or updates the ready
`Release Ontahi <version>` pull request. No release has happened yet.

For a maintainer releasing the accumulated changes:

1. Review and merge `Release Ontahi <version>` when its accumulated notes are ready.
2. The merge automatically builds and verifies every package, publishes through npm trusted
   publishing, and creates the matching `v<version>` tag and GitHub prerelease.
3. Update consumers to that exact version.

Do not run `changeset version`, edit package versions, push release tags, or use an npm token
manually. The generated pull request and trusted-publishing workflow own those steps.

## Record a public change

A pull request that changes a package's behavior or public contract includes a changeset:

```sh
pnpm changeset
```

Select the directly affected packages and describe the consumer-visible result. Ontahi's ten public
packages are a fixed group: the highest requested release type determines one shared version for
the complete set. Documentation, CI, examples, and repository-only tooling normally need no
changeset.

After changesets reach `main`, the **Changesets** workflow creates or updates a ready
`Release Ontahi <version>` pull request. It consumes those files, writes package changelogs, and
advances the current alpha train. Its commits and release files are bot-owned; package versions are
never edited by hand.

## Local release proof

Build and validate the package boundary before dispatching GitHub Actions:

```sh
pnpm build:packages
pnpm verify:artifacts -- --skip-build
pnpm release:npm:prepare -- \
  --tag alpha \
  --output ".artifacts/npm/candidate"
pnpm release:npm:dry-run -- \
  --manifest ".artifacts/npm/candidate/release-manifest.json"
```

The release manifest records every tarball in dependency order and its integrity. The offline npm
dry-run validates the exact public payload without credentials. The publish step rejects an
incomplete package set, changed tarballs, a source/version mismatch, a stable version, or an npm
version that already exists with different contents.

## Developer documentation gate

Treat developer documentation as part of the release candidate, not as a follow-up after
publishing. An agent or maintainer preparing a release must complete this reconciliation before
merging the generated release pull request:

1. Use the accumulated Changesets since the previous tag as the consumer-visible change index.
2. Cross-check that index against completed Plans and changed Atlas items; Changesets are concise
   release notes, not the complete conceptual source.
3. Verify the documented APIs against the packed artifacts and the executable Todo and Classroom
   examples that apply to the candidate.
4. Update the canonical [`Ontahí for Developers`](./docs/developers/README.md) source for the
   resulting model, lifecycle, examples, and migration guidance. If its canonical source moves
   repositories, preserve provenance and leave a relocation notice instead of maintaining
   duplicate copies.
5. Do not merge the release pull request until package notes, durable design records, executable
   examples, and developer documentation describe the same shipped surface.

## Trusted publishing

Every package authorizes the same GitHub Actions workflow through npm trusted publishing. The
`npm-release` environment and `release.yml` workflow are the publishing identity; the repository
does not use a long-lived npm token.

The trust can be inspected or restored with npm CLI 11.15 or newer and an interactive,
2FA-authenticated npm session:

```sh
for package in codegen core devtools explorer-react opentelemetry postgres react \
  runtime-express runtime-nextjs runtime-vercel-workflows supabase; do
  npm trust github "@ontahi/$package" \
    --file release.yml \
    --repo javifernandes/ontahi \
    --env npm-release \
    --allow-publish
done
```

## Normal prerelease

1. Review the accumulated `Release Ontahi <version>` pull request and its successful checks.
2. Run the local proof and a representative host application's packed-artifact compatibility gate
   when the candidate warrants an additional consumer rehearsal.
3. Merge the release pull request. The merge publishes through GitHub OIDC and creates its tag and
   GitHub prerelease automatically.
4. Pin the exact version in host applications and commit each manifest and lockfile together.

The **npm prerelease** workflow remains manually dispatchable for an independent `dry-run` or to
retry the exact version after an infrastructure failure. Manual `publish` uses the same immutable,
idempotent package checks as the automatic path; it is not the normal release button.

`alpha` and `next` are discovery channels only. Consumers commit exact versions, never
floating dist-tags. The repository remains in Changesets alpha prerelease mode until a deliberate
stable-release change exits that train.

## Failure and rollback

npm releases are immutable and the ten publishes cannot be transactional. Before publishing
anything, the script checks every package version. If a network failure leaves a partial release,
rerun the same workflow: identical existing tarballs are skipped and the missing packages continue
in dependency order. A version that exists with different contents stops the release.

Do not overwrite or unpublish a faulty release. Deprecate it when appropriate, publish a new
prerelease version, and roll host applications back by reverting their exact package versions and
lockfiles together. The current workflow intentionally refuses stable versions; a stable channel
is enabled only after the prerelease has passed Todo Express and representative registry-consumer
proofs.
