# Releasing Ontahi

Ontahi publishes all ten `@ontahi/*` packages at one exact lockstep prerelease version. Publication
is manual: merging `main` or a version pull request never publishes to npm.

## The short version

For a contributor changing a public package:

1. Run `pnpm changeset` in the feature branch.
2. Select only the packages directly affected and describe the consumer-visible change.
3. Commit the generated `.changeset/*.md` file with the code and open the pull request.

After the feature pull request is merged, automation creates or updates the ready
`chore: version Ontahi packages` pull request. No release has happened yet.

For a maintainer releasing the accumulated changes:

1. Review and merge `chore: version Ontahi packages`; this commits the shared version and
   changelogs but still does not publish.
2. Wait for `main` CI.
3. In GitHub Actions, run **npm prerelease** from `main` with `mode: publish`, the exact version from
   the version pull request, and `channel: alpha`.
4. Create the matching GitHub prerelease and update consumers to that exact version.

Do not run `changeset version`, edit package versions, push tags, or use an npm token manually. The
version pull request and the trusted-publishing workflow own those steps.

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
`chore: version Ontahi packages` pull request. It consumes those files, writes package changelogs,
and advances the current alpha train. Package versions are never edited by hand.

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

## Trusted publishing

Every package authorizes the same GitHub Actions workflow through npm trusted publishing. The
`npm-release` environment and `release.yml` workflow are the publishing identity; the repository
does not use a long-lived npm token.

The trust can be inspected or restored with npm CLI 11.15 or newer and an interactive,
2FA-authenticated npm session:

```sh
for package in codegen core explorer-react opentelemetry postgres react \
  runtime-express runtime-nextjs runtime-vercel-workflows supabase; do
  npm trust github "@ontahi/$package" \
    --file release.yml \
    --repo javifernandes/ontahi \
    --env npm-release \
    --allow-publish
done
```

## Normal prerelease

1. Merge the accumulated `chore: version Ontahi packages` pull request and wait for CI.
2. Run the local proof and the BookOps packed-artifact compatibility gate against that commit.
3. Dispatch **npm prerelease** with the exact committed package version, first in `dry-run` mode if
   an independent rehearsal is useful.
4. Dispatch it in `publish` mode. GitHub OIDC is the only supported npm authentication path.
5. Create a matching GitHub prerelease from the generated changelogs.
6. Pin the exact version in BookOps and commit its manifests and lockfile together.

`alpha` and `next` are discovery channels only. Consumers and BookOps commit exact versions, never
floating dist-tags. The repository remains in Changesets alpha prerelease mode until a deliberate
stable-release change exits that train.

## Failure and rollback

npm releases are immutable and the ten publishes cannot be transactional. Before publishing
anything, the script checks every package version. If a network failure leaves a partial release,
rerun the same workflow: identical existing tarballs are skipped and the missing packages continue
in dependency order. A version that exists with different contents stops the release.

Do not overwrite or unpublish a faulty release. Deprecate it when appropriate, publish a new
prerelease version, and roll BookOps back by reverting its exact package versions and lockfile
together. The current workflow intentionally refuses stable versions; a stable channel is enabled
only after the prerelease has passed the real Todo Express and BookOps registry-consumer proofs.
